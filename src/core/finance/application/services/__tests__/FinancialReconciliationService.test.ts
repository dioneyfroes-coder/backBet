import {
  FinancialReconciliationService,
} from '@/core/finance/application/services/FinancialReconciliationService';
import { LedgerEntry, LedgerOperationType } from '@/core/finance/domain/entities/LedgerEntry';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';
import { ILedgerRepository } from '@/core/finance/domain/repositories/ILedgerRepository';

describe('FinancialReconciliationService', () => {
  let walletRepo: IWalletRepository;
  let ledgerRepo: ILedgerRepository;
  let manager: FinancialReconciliationService;

  type StoredEntry = {
    type: LedgerOperationType;
    amountCents: number;
  };

  const ledgerRows = new Map<string, StoredEntry[]>();

  beforeEach(() => {
    ledgerRows.clear();
    ledgerRepo = {
      append: jest.fn(),
      exists: jest.fn(),
      findByUserId: jest.fn(),
      countByUserId: jest.fn(),
      aggregateByTypes: jest.fn(),
      sumByTypes: async (userId: string, types: LedgerOperationType[]) => {
        const rows = ledgerRows.get(userId) ?? [];
        const matched = rows.filter((r) => types.includes(r.type));
        return {
          amountCents: matched.reduce((acc, r) => acc + r.amountCents, 0),
          count: matched.length,
        };
      },
    };
    walletRepo = {
      findByUserId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getHistory: jest.fn(),
    };
    manager = new FinancialReconciliationService(walletRepo, ledgerRepo);
  });

  const addLedger = (userId: string, type: LedgerOperationType, amountCents: number) => {
    const rows = ledgerRows.get(userId) ?? [];
    rows.push({ type, amountCents });
    ledgerRows.set(userId, rows);
  };

  const seedWallet = (userId: string, ops: Array<['deposit' | 'withdraw' | 'lock' | 'unlock' | 'withdrawLocked', number]>) => {
    const wallet = new Wallet(userId, 'BRL');
    for (const [op, amount] of ops) {
      if (op === 'deposit') wallet.deposit(amount);
      if (op === 'withdraw') wallet.withdraw(amount);
      if (op === 'lock') wallet.lock(amount);
      if (op === 'unlock') wallet.unlock(amount);
      if (op === 'withdrawLocked') wallet.withdrawLocked(amount);
    }
    (walletRepo.findByUserId as jest.Mock).mockResolvedValue(wallet);
    return wallet;
  };

  it('carteira vazia sem ledger passa', async () => {
    (walletRepo.findByUserId as jest.Mock).mockResolvedValue(new Wallet('u1', 'BRL'));
    const r = await manager.reconcileUser('u1');
    expect(r.passed).toBe(true);
    expect(r.entries).toBe(0);
  });

  it('usuário sem carteira e sem ledger passa (custo-zero)', async () => {
    const r = await manager.reconcileUser('ghost');
    expect(r.missingWallet).toBe(true);
    expect(r.passed).toBe(true);
  });

  it('usuário com ledger mas SEM carteira falha (movimento órfão)', async () => {
    addLedger('u1', 'DEPOSIT', 100_00);
    const r = await manager.reconcileUser('u1');
    expect(r.missingWallet).toBe(true);
    expect(r.passed).toBe(false);
  });

  it('deposit simples reconcilia', async () => {
    seedWallet('u1', [['deposit', 100]]);
    addLedger('u1', 'DEPOSIT', 100_00);
    const r = await manager.reconcileUser('u1');
    expect(r.balancePassed).toBe(true);
    expect(r.lockedPassed).toBe(true);
    expect(r.passed).toBe(true);
  });

  it('hold + completed de saque: balance e locked deriváveis do ledger', async () => {
    seedWallet('u1', [
      ['deposit', 100],
      ['lock', 60],
      ['withdrawLocked', 60],
    ]);
    addLedger('u1', 'DEPOSIT', 100_00);
    addLedger('u1', 'WITHDRAWAL_HOLD', 60_00);
    addLedger('u1', 'WITHDRAWAL_COMPLETED', 60_00);
    const r = await manager.reconcileUser('u1');
    expect(r.balanceCents).toBe(40_00);
    expect(r.ledgerBalanceCents).toBe(40_00);
    expect(r.lockedBalanceCents).toBe(0);
    expect(r.ledgerLockedCents).toBe(0);
    expect(r.passed).toBe(true);
  });

  it('hold + reversed (saque negado) reconcilia de volta ao saldo', async () => {
    seedWallet('u1', [
      ['deposit', 100],
      ['lock', 60],
      ['unlock', 60],
    ]);
    addLedger('u1', 'DEPOSIT', 100_00);
    addLedger('u1', 'WITHDRAWAL_HOLD', 60_00);
    addLedger('u1', 'WITHDRAWAL_REVERSED', 60_00);
    const r = await manager.reconcileUser('u1');
    expect(r.balanceCents).toBe(100_00);
    expect(r.passed).toBe(true);
  });

  it('aposta + prêmio (BET_DEBIT + BET_WIN) reconcilia', async () => {
    seedWallet('u1', [
      ['deposit', 1000],
      ['withdraw', 100],
    ]);
    addLedger('u1', 'DEPOSIT', 1000_00);
    addLedger('u1', 'BET_DEBIT', 100_00);
    const r = await manager.reconcileUser('u1');
    expect(r.balanceCents).toBe(900_00);
    expect(r.ledgerBalanceCents).toBe(900_00);
    expect(r.passed).toBe(true);
  });

  it('diverge quando o saldo da carteira não bate com o ledger', async () => {
    seedWallet('u1', [['deposit', 100]]);
    // ledger "perdeu" o depósito — movimento órfão da carteira (crash no meio?)
    const r = await manager.reconcileUser('u1');
    expect(r.balanceDiffCents).toBe(100_00);
    expect(r.balancePassed).toBe(false);
    expect(r.passed).toBe(false);
  });

  it('diverge quando o ledger contém movimento extra (double-apply pós-retry)', async () => {
    seedWallet('u1', [['deposit', 100]]);
    addLedger('u1', 'DEPOSIT', 100_00);
    addLedger('u1', 'DEPOSIT', 100_00);
    const r = await manager.reconcileUser('u1');
    expect(r.ledgerBalanceCents).toBe(200_00);
    expect(r.passed).toBe(false);
  });

  it('STAKE_LOCK/STAKE_RELEASE/GAME_WIN (jogo) reconciliam', async () => {
    seedWallet('u1', [
      ['deposit', 100],
      ['lock', 10],
      ['withdrawLocked', 10],
      ['deposit', 11],
    ]);
    addLedger('u1', 'DEPOSIT', 100_00);
    addLedger('u1', 'STAKE_LOCK', 10_00);
    addLedger('u1', 'STAKE_RELEASE', 10_00);
    addLedger('u1', 'GAME_WIN', 11_00);
    const r = await manager.reconcileUser('u1');
    // balance = 100 - 10 + 11 = 101; locked = 10 - 10 = 0
    expect(r.balanceCents).toBe(101_00);
    expect(r.ledgerBalanceCents).toBe(100_00 - 10_00 + 11_00);
    expect(r.ledgerLockedCents).toBe(10_00 - 10_00);
    expect(r.passed).toBe(true);
  });

  it('reconcileUsers resume múltiplos usuários', async () => {
    const w1 = new Wallet('u1', 'BRL');
    w1.deposit(100);
    const w2 = new Wallet('u2', 'BRL');
    w2.deposit(50);
    (walletRepo.findByUserId as jest.Mock).mockImplementation(async (userId: string) =>
      userId === 'u1' ? w1 : w2,
    );
    addLedger('u1', 'DEPOSIT', 100_00);
    addLedger('u2', 'DEPOSIT', 50_00);
    addLedger('u2', 'DEPOSIT', 50_00);
    const summary = await manager.reconcileUsers(['u1', 'u2']);
    expect(summary.checked).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
  });
});