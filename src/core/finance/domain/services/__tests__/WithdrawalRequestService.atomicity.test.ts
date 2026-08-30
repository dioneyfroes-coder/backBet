process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

import { WithdrawalRequestService } from '../WithdrawalRequestService';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { InMemoryLedgerRepository } from '@/core/finance/domain/repositories/InMemoryLedgerRepository';
import { WithdrawalRequestRepository } from '@/core/finance/domain/repositories/WithdrawalRequestRepository';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { LedgerEntry } from '@/core/finance/domain/entities/LedgerEntry';
import { WithdrawalRequest } from '@/core/finance/domain/entities/WithdrawalRequest';
import { Currency } from '@/core/finance/domain/value-objects/Currency';
import { TransactionSession } from '@/core/shared/types/Transaction';

const USER_ID = 'user-withdrawal-atomic';

function createHarness() {
  const walletRepo = new WalletRepository();
  const ledgerRepo = new InMemoryLedgerRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  return { walletRepo, ledgerRepo, walletService };
}

async function withRollback<T>(
  harness: ReturnType<typeof createHarness>,
  requestRepo: WithdrawalRequestRepository,
  work: (session: TransactionSession) => Promise<T>,
): Promise<T> {
  const wallets = [...(harness.walletRepo as unknown as { wallets: Wallet[] }).wallets];
  const entries = [...(harness.ledgerRepo as unknown as { entries: LedgerEntry[] }).entries];
  const requests = [...(requestRepo as unknown as { requests: WithdrawalRequest[] }).requests];
  try {
    return await work({});
  } catch (error) {
    (harness.walletRepo as unknown as { wallets: Wallet[] }).wallets = wallets;
    (harness.ledgerRepo as unknown as { entries: LedgerEntry[] }).entries = entries;
    (requestRepo as unknown as { requests: WithdrawalRequest[] }).requests = requests;
    throw error;
  }
}

class FailingRequestRepository extends WithdrawalRequestRepository {
  override async create(request: WithdrawalRequest): Promise<WithdrawalRequest> {
    throw new Error('db down during withdrawal request creation');
  }
}

type WithTransactionRepo = WithdrawalRequestRepository & {
  withTransaction: <T>(work: (session: TransactionSession) => Promise<T>) => Promise<T>;
};

const withRollbackRunner = (
  harness: ReturnType<typeof createHarness>,
  requestRepo: WithdrawalRequestRepository,
): WithTransactionRepo['withTransaction'] =>
  (work) => withRollback(harness, requestRepo, work);

const seed = async (walletService: WalletService): Promise<void> => {
  await walletService.createWallet({ userId: USER_ID, currency: 'BRL' });
  await walletService.deposit(USER_ID, 1000, {
    type: 'DEPOSIT',
    referenceId: 'seed-atomic',
    source: 'DEPOSIT',
  });
};

describe('WithdrawalRequestService — atomicidade da criação (Fase 2: janela de crash do withdrawal)', () => {
  it('com transação: crash ao persistir a request reverte lock + ledger + request (sem hold órfão)', async () => {
    const harness = createHarness();
    const requestRepo = new FailingRequestRepository() as WithTransactionRepo;
    requestRepo.withTransaction = withRollbackRunner(harness, requestRepo);

    const service = new WithdrawalRequestService(requestRepo, harness.walletService);
    await seed(harness.walletService);

    await expect(service.createRequest(USER_ID, 100, 'BRL' as Currency)).rejects.toThrow(
      'db down during withdrawal request creation',
    );

    const wallet = await harness.walletService.findByUserId(USER_ID);
    expect(wallet?.balance).toBe(1000);
    expect(wallet?.lockedBalance).toBe(0);

    const { entries } = await harness.walletService.getLedgerHistory(USER_ID, 50, 0);
    expect(entries.filter((entry: LedgerEntry) => entry.type === 'WITHDRAWAL_HOLD')).toHaveLength(0);

    expect((requestRepo as unknown as { requests: WithdrawalRequest[] }).requests).toHaveLength(0);
  });

  it('com transação e sucesso: lock + request persistem juntos (consistentes)', async () => {
    const harness = createHarness();
    const requestRepo = new WithdrawalRequestRepository() as WithTransactionRepo;
    requestRepo.withTransaction = withRollbackRunner(harness, requestRepo);

    const service = new WithdrawalRequestService(requestRepo, harness.walletService);
    await seed(harness.walletService);

    const request = await service.createRequest(USER_ID, 100, 'BRL' as Currency);

    expect(request.status).toBe('REQUESTED');
    expect((requestRepo as unknown as { requests: WithdrawalRequest[] }).requests).toHaveLength(1);

    const wallet = await harness.walletService.findByUserId(USER_ID);
    expect(wallet?.balance).toBe(900);
    expect(wallet?.lockedBalance).toBe(100);

    const { entries } = await harness.walletService.getLedgerHistory(USER_ID, 50, 0);
    expect(
      entries.filter((entry: LedgerEntry) => entry.type === 'WITHDRAWAL_HOLD'),
    ).toHaveLength(1);
  });

  it('sem transação: falha ao persistir a request dispara unlock compensatório (comportamento legado preservado)', async () => {
    const harness = createHarness();
    const requestRepo = new FailingRequestRepository();

    const service = new WithdrawalRequestService(requestRepo, harness.walletService);
    await seed(harness.walletService);

    await expect(service.createRequest(USER_ID, 100, 'BRL' as Currency)).rejects.toThrow(
      'db down during withdrawal request creation',
    );

    const wallet = await harness.walletService.findByUserId(USER_ID);
    expect(wallet?.balance).toBe(1000);
    expect(wallet?.lockedBalance).toBe(0);
    expect((requestRepo as unknown as { requests: WithdrawalRequest[] }).requests).toHaveLength(0);
  });
});