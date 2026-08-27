import { LedgerEntry } from '../../entities/LedgerEntry';
import { InMemoryLedgerRepository } from '../InMemoryLedgerRepository';

describe('LedgerEntry', () => {
  it('exposes amount in units and cents without mutating', () => {
    const entry = new LedgerEntry(
      'tx-1',
      'user-1',
      'BET_DEBIT',
      10050,
      'BRL',
      'bet-1',
      'BET',
      'COMPLETED',
      new Date('2026-01-01T00:00:00.000Z'),
      { round: 1 },
    );

    expect(entry.amount).toBe(100.5);
    expect(entry.amountCents).toBe(10050);
    expect(entry.type).toBe('BET_DEBIT');
    expect(entry.source).toBe('BET');
    expect(entry.referenceId).toBe('bet-1');
    expect(entry.toDTO()).toMatchObject({
      transactionId: 'tx-1',
      userId: 'user-1',
      type: 'BET_DEBIT',
      amount: 100.5,
      currency: 'BRL',
      referenceId: 'bet-1',
      source: 'BET',
      status: 'COMPLETED',
    });
  });
});

describe('InMemoryLedgerRepository', () => {
  it('appends entries (append-only style) and reads them back ordered by insertion', async () => {
    const repo = new InMemoryLedgerRepository();
    const first = new LedgerEntry('tx-1', 'user-1', 'DEPOSIT', 10000, 'BRL', undefined, 'PIX', 'COMPLETED', new Date(), undefined);
    const second = new LedgerEntry('tx-2', 'user-1', 'BET_DEBIT', 2000, 'BRL', 'bet-1', 'BET', 'COMPLETED', new Date(), undefined);

    await repo.append(first);
    await repo.append(second);

    const all = await repo.findByUserId('user-1');
    expect(all).toHaveLength(2);
    // most recent appended first
    expect(all[0].transactionId).toBe('tx-2');
    expect(all[1].transactionId).toBe('tx-1');
    expect(await repo.countByUserId('user-1')).toBe(2);
    expect(await repo.countByUserId('other')).toBe(0);
  });

  it('is idempotent by transactionId (upsert)', async () => {
    const repo = new InMemoryLedgerRepository();
    const entry = new LedgerEntry('tx-1', 'user-1', 'DEPOSIT', 10000, 'BRL', undefined, 'PIX', 'COMPLETED', new Date(), undefined);
    await repo.append(entry);
    await repo.append(entry);
    expect(await repo.countByUserId('user-1')).toBe(1);
  });

  it('supports offset/limit pagination', async () => {
    const repo = new InMemoryLedgerRepository();
    for (let i = 1; i <= 5; i += 1) {
      await repo.append(
        new LedgerEntry(`tx-${i}`, 'user-1', 'DEPOSIT', i * 1000, 'BRL', undefined, 'PIX', 'COMPLETED', new Date(), undefined),
      );
    }
    const page = await repo.findByUserId('user-1', { limit: 2, offset: 1 });
    expect(page.map((e) => e.transactionId)).toEqual(['tx-4', 'tx-3']);
  });
});

describe('WalletService ledger integration', () => {
  it('appends ledger entries and exposes history when a ledger repository is injected', async () => {
    const { WalletService } = await import('../../services/WalletService');
    const inMemoryWalletRepo = { findByUserId: jest.fn(), save: jest.fn(), update: jest.fn() } as any;
    const ledger = new InMemoryLedgerRepository();

    const wallet = { userId: 'user-1', balance: 100, currency: 'BRL', deposit: jest.fn(), withdraw: jest.fn(), incrementVersion: jest.fn(), lock: jest.fn(), unlock: jest.fn(), withdrawLocked: jest.fn() } as any;
    inMemoryWalletRepo.findByUserId.mockResolvedValue(wallet);

    const service = new WalletService(inMemoryWalletRepo, ledger);
    await service.deposit('user-1', 50);

    const history = await service.getLedgerHistory('user-1');
    expect(history.total).toBe(1);
    expect(history.entries[0].type).toBe('DEPOSIT');
    expect(history.entries[0].amount).toBe(50);
    expect(history.entries[0].source).toBeUndefined();
  });

  it('returns empty history when no ledger repository is configured', async () => {
    const { WalletService } = await import('../../services/WalletService');
    const service = new WalletService({} as any);
    const history = await service.getLedgerHistory('user-1');
    expect(history).toEqual({ entries: [], total: 0 });
  });
});
