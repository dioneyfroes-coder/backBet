import { WalletService } from '../WalletService';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { ILedgerRepository } from '@/core/finance/domain/repositories/ILedgerRepository';
import { LedgerEntry } from '@/core/finance/domain/entities/LedgerEntry';

function baseWalletRepoMock(wallet: Wallet) {
  return {
    findByUserId: jest.fn().mockResolvedValue(wallet),
    save: jest.fn().mockImplementation((w: Wallet) => Promise.resolve(w)),
    update: jest.fn().mockImplementation((w: Wallet) => Promise.resolve(w)),
    delete: jest.fn().mockResolvedValue(undefined),
    getHistory: jest.fn().mockResolvedValue({ transactions: [], total: 0 }),
  };
}

function baseLedgerMock() {
  const ledger = {
    append: jest.fn().mockImplementation((entry: LedgerEntry) => Promise.resolve(entry)),
    exists: jest.fn().mockResolvedValue(false),
    findByUserId: jest.fn().mockResolvedValue([]),
    countByUserId: jest.fn().mockResolvedValue(0),
    sumByTypes: jest.fn().mockResolvedValue({ amountCents: 0, count: 0 }),
    aggregateByTypes: jest.fn().mockResolvedValue({ amountCents: 0, count: 0 }),
  };
  return ledger as jest.Mocked<ILedgerRepository>;
}

describe('WalletService — atomicidade Wallet + Ledger', () => {
  it('Com withTransaction disponível, wallet e ledger rodam na MESMA sessão', async () => {
    const wallet = new Wallet('u-tx', 'BRL');
    const repo = {
      ...baseWalletRepoMock(wallet),
      withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => work({ id: 's-tx' })),
    };
    const ledger = baseLedgerMock();
    const service = new WalletService(repo as never, ledger as never);

    await service.deposit('u-tx', 100, { type: 'DEPOSIT', referenceId: 'ref-1', source: 'CREDIT_PACKAGE' });

    expect(repo.withTransaction).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-tx' }),
      expect.objectContaining({ session: { id: 's-tx' } }),
    );
    expect(ledger.append).toHaveBeenCalledWith(
      expect.any(LedgerEntry),
      expect.objectContaining({ session: { id: 's-tx' } }),
    );
    expect(wallet.balance).toBe(100);
  });

  it('Falha do Ledger NÃO é engolida: depósito rejeita (dentro da transação isso reverte a Wallet)', async () => {
    const wallet = new Wallet('u-fail', 'BRL');
    const repo = {
      ...baseWalletRepoMock(wallet),
      withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => work({ id: 's-fail' })),
    };
    const ledger = baseLedgerMock();
    ledger.append.mockRejectedValue(new Error('ledger insert failed (simulated)'));
    const service = new WalletService(repo as never, ledger as never);

    await expect(
      service.deposit('u-fail', 50, { type: 'DEPOSIT', referenceId: 'ref-2', source: 'CREDIT_PACKAGE' }),
    ).rejects.toThrow('ledger insert failed (simulated)');

    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(ledger.append).toHaveBeenCalled();
  });

  it('Sem withTransaction, a falha do Ledger também rejeita a operação (não é apenas logada)', async () => {
    const wallet = new Wallet('u-nontx', 'BRL');
    const repo = baseWalletRepoMock(wallet);
    const ledger = baseLedgerMock();
    ledger.append.mockRejectedValue(new Error('ledger insert failed (simulated)'));
    const service = new WalletService(repo as never, ledger as never);

    await expect(
      service.deposit('u-nontx', 10, { type: 'DEPOSIT', referenceId: 'ref-3', source: 'CREDIT_PACKAGE' }),
    ).rejects.toThrow('ledger insert failed (simulated)');

    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(ledger.append).toHaveBeenCalled();
  });

  it('withdraw/lock/withdrawLocked também passam a sessão de transação para wallet e ledger', async () => {
    const wallet = new Wallet('u-multi', 'BRL');
    const repo = {
      ...baseWalletRepoMock(wallet),
      withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => work({ id: 's-multi' })),
    };
    const ledger = baseLedgerMock();
    const service = new WalletService(repo as never, ledger as never);

    await service.deposit('u-multi', 200);
    await service.lock('u-multi', 60, { type: 'WITHDRAWAL_HOLD', referenceId: 'wd-1', source: 'WITHDRAWAL' });
    await service.withdrawLocked('u-multi', 60, { type: 'WITHDRAWAL_COMPLETED', referenceId: 'wd-1', source: 'WITHDRAWAL' });

    expect(ledger.append).toHaveBeenCalledTimes(3);
    const sessions = ledger.append.mock.calls.map(([, opts]) => opts?.session as { id?: string } | undefined);
    expect(sessions).toHaveLength(3);
    expect(sessions.every((s) => s?.id === 's-multi')).toBe(true);
    expect(repo.update).toHaveBeenCalledTimes(3);
  });
});