process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

import { randomUUID } from 'crypto';
import {
  recoverWithdrawalProcessing,
  runWithdrawalRecovery,
} from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';
import { MockPaymentAdapter } from '@/infrastructure/payments/MockPaymentAdapter';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { WithdrawalRequestRepository } from '@/core/finance/domain/repositories/WithdrawalRequestRepository';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { InMemoryLedgerRepository } from '@/core/finance/domain/repositories/InMemoryLedgerRepository';
import IPaymentPort, {
  PaymentResult,
  WithdrawalStatusInfo,
} from '@/core/finance/domain/ports/IPaymentPort';
import { Currency } from '@/core/finance/domain/value-objects/Currency';
import type { WithdrawalPayoutPayload } from '@/core/finance/domain/ports/IWithdrawalQueue';

class StubStatusAdapter implements IPaymentPort {
  constructor(private readonly resolveStatus: () => Promise<WithdrawalStatusInfo>) {}

  payWithdrawal(
    _requestId: string,
    _userId: string,
    _amount: number,
    _currency: Currency,
  ): Promise<PaymentResult> {
    throw new Error('payWithdrawal should not be called during recovery');
  }

  getWithdrawalStatus(requestId: string): Promise<WithdrawalStatusInfo> {
    void requestId;
    return this.resolveStatus();
  }
}

type ServiceStub = {
  completePayout: jest.Mock;
  failPayout: jest.Mock;
};

function createServiceStub(): ServiceStub {
  return { completePayout: jest.fn().mockResolvedValue(undefined), failPayout: jest.fn().mockResolvedValue(undefined) };
}

function payloadFor(requestId: string): WithdrawalPayoutPayload {
  return { requestId, userId: 'user-x', amount: 100, currency: 'BRL' };
}

function createHarness() {
  const walletRepo = new WalletRepository();
  const ledgerRepo = new InMemoryLedgerRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const requestRepo = new WithdrawalRequestRepository();
  const service = new WithdrawalRequestService(requestRepo, walletService);
  return { walletRepo, ledgerRepo, walletService, requestRepo, service };
}

async function fundApproveAndStick(
  harness: ReturnType<typeof createHarness>,
  amount = 100,
  initial = 1000,
  stuckMinutesAgo = 10,
): Promise<{ userId: string; requestId: string }> {
  const userId = randomUUID();
  await harness.walletService.createWallet({ userId, currency: 'BRL' });
  await harness.walletService.deposit(userId, initial, {
    type: 'DEPOSIT',
    referenceId: `seed-${userId}`,
    source: 'DEPOSIT',
  });
  const request = await harness.service.createRequest(userId, amount, 'BRL', 'fase-6');
  await harness.service.processRequest(request.id, 'admin-1', 'APPROVED');
  await harness.service.markProcessing(request.id);
  const stuck = await harness.requestRepo.findById(request.id);
  expect(stuck).not.toBeNull();
  if (!stuck) throw new Error('request not found');
  stuck.processingAt = new Date(Date.now() - stuckMinutesAgo * 60 * 1000);
  await harness.requestRepo.update(stuck);
  return { userId, requestId: request.id };
}

async function completedDebits(
  harness: ReturnType<typeof createHarness>,
  userId: string,
  requestId: string,
): Promise<number> {
  const { entries } = await harness.walletService.getLedgerHistory(userId, 200, 0);
  return entries.filter(
    (entry) => entry.type === 'WITHDRAWAL_COMPLETED' && entry.referenceId === requestId,
  ).length;
}

describe('WithdrawalPayoutWorker.recoverWithdrawalProcessing (Fase 6)', () => {
  it('PSP pagou (PAID): conclui o payout uma única vez, mesmo com repescagem', async () => {
    const adapter = new StubStatusAdapter(async () => ({ status: 'PAID', transactionId: 'tx-1' }));
    const service = createServiceStub();
    const payload = payloadFor(randomUUID());

    const first = await recoverWithdrawalProcessing(payload, adapter, service as unknown as WithdrawalRequestService);
    const second = await recoverWithdrawalProcessing(payload, adapter, service as unknown as WithdrawalRequestService);

    expect(first).toBe('paid');
    expect(second).toBe('paid');
    expect(service.completePayout).toHaveBeenCalledTimes(1);
    expect(service.failPayout).not.toHaveBeenCalled();
  });

  it('PSP rejeitou (FAILED): devolve o saldo e marca FAILED sem refazer o pagamento', async () => {
    const adapter = new StubStatusAdapter(async () => ({ status: 'FAILED', error: 'insufficient_funds' }));
    const service = createServiceStub();
    const payload = payloadFor(randomUUID());

    const outcome = await recoverWithdrawalProcessing(payload, adapter, service as unknown as WithdrawalRequestService);

    expect(outcome).toBe('failed');
    expect(service.failPayout).toHaveBeenCalledTimes(1);
    expect(service.completePayout).not.toHaveBeenCalled();
  });

  it('PSP sem registro (UNKNOWN): não altera nada; nova checagem depois', async () => {
    const adapter = new StubStatusAdapter(async () => ({ status: 'UNKNOWN' }));
    const service = createServiceStub();

    const outcome = await recoverWithdrawalProcessing(payloadFor(randomUUID()), adapter, service as unknown as WithdrawalRequestService);

    expect(outcome).toBe('unknown');
    expect(service.completePayout).not.toHaveBeenCalled();
    expect(service.failPayout).not.toHaveBeenCalled();
  });

  it('adapter sem getWithdrawalStatus: conservative, permanece PROCESSING', async () => {
    const adapter: IPaymentPort = {
      payWithdrawal: async () => ({ success: true }),
    };
    const outcome = await recoverWithdrawalProcessing(
      payloadFor(randomUUID()),
      adapter,
      createServiceStub() as unknown as WithdrawalRequestService,
    );

    expect(outcome).toBe('unknown');
  });

  it('consulta de status falha: error recuperável, sem mutação financeira', async () => {
    const adapter = new StubStatusAdapter(async () => {
      throw new Error('provider down');
    });
    const service = createServiceStub();

    const outcome = await recoverWithdrawalProcessing(payloadFor(randomUUID()), adapter, service as unknown as WithdrawalRequestService);

    expect(outcome).toBe('error');
    expect(service.completePayout).not.toHaveBeenCalled();
    expect(service.failPayout).not.toHaveBeenCalled();
  });
});

describe('WithdrawalPayoutWorker.runWithdrawalRecovery e2e (Fase 6)', () => {
  it('timeout pós-pagamento (PAID): recupera, debita o locked uma vez, e não re-escaneia', async () => {
    const harness = createHarness();
    const { userId, requestId } = await fundApproveAndStick(harness);

    const adapter = new MockPaymentAdapter();
    adapter.simulatePaid(requestId, 'real-tx-outside');

    const summary = await runWithdrawalRecovery({
      repository: harness.requestRepo,
      service: harness.service,
      paymentAdapter: adapter,
      minProcessingAgeMs: 5 * 60 * 1000,
    });

    expect(summary).toMatchObject({ scanned: 1, paid: 1, failed: 0, unknown: 0, errors: 0 });

    const wallet = await harness.walletService.findByUserId(userId);
    expect(wallet?.balance).toBe(900);
    expect(wallet?.lockedBalance).toBe(0);
    expect((await harness.requestRepo.findById(requestId))?.status).toBe('COMPLETED');
    expect(await completedDebits(harness, userId, requestId)).toBe(1);

    const again = await runWithdrawalRecovery({
      repository: harness.requestRepo,
      service: harness.service,
      paymentAdapter: adapter,
      minProcessingAgeMs: 5 * 60 * 1000,
    });
    expect(again.scanned).toBe(0);
    expect(await completedDebits(harness, userId, requestId)).toBe(1);
  }, 20000);

  it('timeout pré-pagamento (FAILED): devolve o valor e nunca paga', async () => {
    const harness = createHarness();
    const { userId, requestId } = await fundApproveAndStick(harness);

    const adapter = new MockPaymentAdapter();
    adapter.simulateFailed(requestId, 'never_debited');

    const summary = await runWithdrawalRecovery({
      repository: harness.requestRepo,
      service: harness.service,
      paymentAdapter: adapter,
      minProcessingAgeMs: 5 * 60 * 1000,
    });

    expect(summary).toMatchObject({ scanned: 1, failed: 1, paid: 0, unknown: 0, errors: 0 });

    const wallet = await harness.walletService.findByUserId(userId);
    expect(wallet?.balance).toBe(1000);
    expect(wallet?.lockedBalance).toBe(0);
    expect((await harness.requestRepo.findById(requestId))?.status).toBe('FAILED');
    expect(await completedDebits(harness, userId, requestId)).toBe(0);
  }, 20000);

  it('PROCESSING recente (não "preso") não é escaneado', async () => {
    const harness = createHarness();
    const { requestId } = await fundApproveAndStick(harness, 100, 1000, 0);

    const adapter = new MockPaymentAdapter();
    adapter.simulatePaid(requestId);

    const summary = await runWithdrawalRecovery({
      repository: harness.requestRepo,
      service: harness.service,
      paymentAdapter: adapter,
      minProcessingAgeMs: 5 * 60 * 1000,
    });

    expect(summary.scanned).toBe(0);
    expect((await harness.requestRepo.findById(requestId))?.status).toBe('PROCESSING');
  });
});