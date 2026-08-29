process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

import { randomUUID } from 'crypto';
import { processWithdrawalPayload } from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { WithdrawalRequestRepository } from '@/core/finance/domain/repositories/WithdrawalRequestRepository';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { InMemoryLedgerRepository } from '@/core/finance/domain/repositories/InMemoryLedgerRepository';
import IPaymentPort, { PaymentResult } from '@/core/finance/domain/ports/IPaymentPort';
import { Currency } from '@/core/finance/domain/value-objects/Currency';
import type { WithdrawalPayoutPayload } from '@/core/finance/domain/ports/IWithdrawalQueue';

class ControlledAdapter implements IPaymentPort {
  public attempts = 0;
  public timeoutsRemaining = 0;

  async payWithdrawal(
    _requestId: string,
    _userId: string,
    _amount: number,
    _currency: Currency,
  ): Promise<PaymentResult> {
    this.attempts += 1;
    if (this.timeoutsRemaining > 0) {
      this.timeoutsRemaining -= 1;
      throw new Error('ETIMEDOUT simulated provider timeout');
    }
    return { success: true, transactionId: `tx-${this.attempts}` };
  }
}

function createHarness() {
  const walletRepo = new WalletRepository();
  const ledgerRepo = new InMemoryLedgerRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const requestRepo = new WithdrawalRequestRepository();
  const service = new WithdrawalRequestService(requestRepo, walletService);
  return { walletRepo, ledgerRepo, walletService, requestRepo, service };
}

async function fundAndApprove(
  harness: ReturnType<typeof createHarness>,
  amount = 100,
  initial = 1000,
): Promise<{ userId: string; requestId: string }> {
  const userId = randomUUID();
  await harness.walletService.createWallet({ userId, currency: 'BRL' });
  await harness.walletService.deposit(userId, initial, {
    type: 'DEPOSIT',
    referenceId: `seed-${userId}`,
    source: 'DEPOSIT',
  });
  const request = await harness.service.createRequest(userId, amount, 'BRL', 'fase-20');
  await harness.service.processRequest(request.id, 'admin-1', 'APPROVED');
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

describe('WithdrawalPayoutWorker — cenários críticos (Fase 20)', () => {
  it('entrega duplicada do mesmo worker (sequencial): paga uma única vez', async () => {
    const harness = createHarness();
    const { userId, requestId } = await fundAndApprove(harness);
    const adapter = new ControlledAdapter();
    const payload: WithdrawalPayoutPayload = { requestId, userId, amount: 100, currency: 'BRL' };

    await expect(processWithdrawalPayload(payload, adapter, harness.service)).resolves.toBeUndefined();
    await expect(processWithdrawalPayload(payload, adapter, harness.service)).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    expect(adapter.attempts).toBe(1);
    const wallet = await harness.walletService.findByUserId(userId);
    expect(wallet?.balance).toBe(900);
    expect(wallet?.lockedBalance).toBe(0);
    expect((await harness.requestRepo.findById(requestId))?.status).toBe('COMPLETED');
    expect(await completedDebits(harness, userId, requestId)).toBe(1);
  }, 20000);

  it('entrega duplicada do mesmo worker (concorrente): apenas uma executa o payout', async () => {
    const harness = createHarness();
    const { userId, requestId } = await fundAndApprove(harness);
    const adapter = new ControlledAdapter();
    const payload: WithdrawalPayoutPayload = { requestId, userId, amount: 100, currency: 'BRL' };

    const results = await Promise.allSettled([
      processWithdrawalPayload(payload, adapter, harness.service),
      processWithdrawalPayload(payload, adapter, harness.service),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason?.code).toBe('CONFLICT');
    expect(adapter.attempts).toBe(1);

    const wallet = await harness.walletService.findByUserId(userId);
    expect(wallet?.balance).toBe(900);
    expect(wallet?.lockedBalance).toBe(0);
    expect((await harness.requestRepo.findById(requestId))?.status).toBe('COMPLETED');
    expect(await completedDebits(harness, userId, requestId)).toBe(1);
  }, 20000);

  it('timeout do provedor: não debita; o retry do worker conclui sem dobrar', async () => {
    const harness = createHarness();
    const { userId, requestId } = await fundAndApprove(harness);
    const adapter = new ControlledAdapter();
    adapter.timeoutsRemaining = 1;
    const payload: WithdrawalPayoutPayload = { requestId, userId, amount: 100, currency: 'BRL' };

    await expect(processWithdrawalPayload(payload, adapter, harness.service)).rejects.toThrow(
      'ETIMEDOUT',
    );

    const afterFailure = await harness.walletService.findByUserId(userId);
    expect(afterFailure?.balance).toBe(900);
    expect(afterFailure?.lockedBalance).toBe(100);
    expect((await harness.requestRepo.findById(requestId))?.status).toBe('PROCESSING');
    expect(await completedDebits(harness, userId, requestId)).toBe(0);

    await expect(processWithdrawalPayload(payload, adapter, harness.service)).resolves.toBeUndefined();
    expect(adapter.attempts).toBe(2);

    const wallet = await harness.walletService.findByUserId(userId);
    expect(wallet?.balance).toBe(900);
    expect(wallet?.lockedBalance).toBe(0);
    expect((await harness.requestRepo.findById(requestId))?.status).toBe('COMPLETED');
    expect(await completedDebits(harness, userId, requestId)).toBe(1);
  }, 20000);

  it('resposta duplicada do provedor pós-completePayout: ledger impede débito duplo', async () => {
    const harness = createHarness();
    const { userId, requestId } = await fundAndApprove(harness);
    const adapter = new ControlledAdapter();
    const payload: WithdrawalPayoutPayload = { requestId, userId, amount: 100, currency: 'BRL' };

    await expect(processWithdrawalPayload(payload, adapter, harness.service)).resolves.toBeUndefined();
    expect(adapter.attempts).toBe(1);

    await expect(harness.service.completePayout(requestId)).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    await expect(
      harness.walletService.withdrawLocked(userId, 100, {
        type: 'WITHDRAWAL_COMPLETED',
        referenceId: requestId,
        source: 'WITHDRAWAL',
      }),
    ).resolves.toBeDefined();

    const wallet = await harness.walletService.findByUserId(userId);
    expect(wallet?.balance).toBe(900);
    expect(wallet?.lockedBalance).toBe(0);
    expect((await harness.requestRepo.findById(requestId))?.status).toBe('COMPLETED');
    expect(await completedDebits(harness, userId, requestId)).toBe(1);
  }, 20000);
});