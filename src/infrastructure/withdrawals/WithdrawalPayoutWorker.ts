import Queue from 'bull';
import type { Queue as BullQueue } from 'bull';
import { createPaymentAdapter } from '@/infrastructure/payments/factory';
import {
  withdrawalPayoutSuccessCounter,
  withdrawalPayoutFailedCounter,
} from '@/infrastructure/observability/metrics';
import type { WithdrawalPayoutPayload } from '@/core/finance/domain/ports/IWithdrawalQueue';
import type IPaymentPort from '@/core/finance/domain/ports/IPaymentPort';
import type { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import type { IWithdrawalRequestRepository } from '@/core/finance/domain/repositories/IWithdrawalRequestRepository';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { idempotencyService } from '@/shared/services/IdempotencyService';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

async function markProcessingBestEffort(
  payload: WithdrawalPayoutPayload,
  service?: WithdrawalRequestService,
): Promise<void> {
  if (!service) {
    return;
  }
  try {
    await service.markProcessing(payload.requestId);
  } catch (err) {
    writeStructuredLog({
      event: 'withdrawal_state_transition_skipped',
      requestId: payload.requestId,
      err,
    });
  }
}

export async function processWithdrawalPayloadOnce(
  payload: WithdrawalPayoutPayload,
  paymentAdapter?: IPaymentPort,
  service?: WithdrawalRequestService,
): Promise<void> {
  const adapter = paymentAdapter ?? createPaymentAdapter();

  // Reflect APPROVED -> PROCESSING before contacting the provider (best effort).
  await markProcessingBestEffort(payload, service);

  let res;
  try {
    res = await adapter.payWithdrawal(
      payload.requestId,
      payload.userId,
      payload.amount,
      payload.currency,
    );
  } catch (err) {
    try {
      withdrawalPayoutFailedCounter.inc();
    } catch (e) {
      console.debug('withdrawalPayoutFailedCounter inc failed', e);
    }
    writeStructuredLog({ event: 'withdrawal_payout_error', requestId: payload.requestId, err });
    throw err;
  }

  if (!res.success) {
    try {
      withdrawalPayoutFailedCounter.inc();
    } catch (e) {
      console.debug('withdrawalPayoutFailedCounter inc failed', e);
    }
    writeStructuredLog({
      event: 'withdrawal_payout_failed',
      requestId: payload.requestId,
      error: res.error,
    });
    // signal failure for queue retries
    throw new Error(res.error ?? 'payout_failed');
  }

  try {
    withdrawalPayoutSuccessCounter.inc();
  } catch (e) {
    console.debug('withdrawalPayoutSuccessCounter inc failed', e);
  }
  writeStructuredLog({
    event: 'withdrawal_payout_success',
    requestId: payload.requestId,
    tx: res.transactionId,
  });

  // The external payout already succeeded. Update the request to COMPLETED and
  // debit the locked funds. Any state-update failure is logged but NOT rethrown,
  // otherwise a queue retry would re-run the adapter and double-pay the user.
  if (service) {
    try {
      await service.completePayout(payload.requestId);
    } catch (err) {
      writeStructuredLog({
        event: 'withdrawal_complete_persist_failed',
        requestId: payload.requestId,
        err,
      });
    }
  }
}

export async function processWithdrawalPayload(
  payload: WithdrawalPayoutPayload,
  paymentAdapter?: IPaymentPort,
  service?: WithdrawalRequestService,
): Promise<void> {
  await idempotencyService.execute(
    `withdrawal-payout:${payload.requestId}`,
    JSON.stringify(payload),
    () => processWithdrawalPayloadOnce(payload, paymentAdapter, service),
  );
}

export type WithdrawalRecoveryOutcome = 'paid' | 'failed' | 'unknown' | 'error';

/**
 * Recupera um withdrawal preso em PROCESSING CONSULTANDO o PSP — nunca re-executa
 * o pagamento. O resultado decide:
 *  - PAID   -> completa o payout (débito do locked) uma única vez;
 *  - FAILED -> devolve o valor ao saldo e marca FAILED;
 *  - outro  -> permanece PROCESSING para uma nova checagem depois.
 */
export async function recoverWithdrawalProcessing(
  payload: WithdrawalPayoutPayload,
  paymentAdapter?: IPaymentPort,
  service?: WithdrawalRequestService,
): Promise<WithdrawalRecoveryOutcome> {
  const adapter = paymentAdapter ?? createPaymentAdapter();
  if (typeof adapter.getWithdrawalStatus !== 'function' || !service) {
    return 'unknown';
  }

  let info;
  try {
    info = await adapter.getWithdrawalStatus(payload.requestId);
  } catch (err) {
    writeStructuredLog({
      event: 'withdrawal_recovery_status_query_failed',
      requestId: payload.requestId,
      err,
    });
    return 'error';
  }

  if (info.status === 'PAID') {
    await idempotencyService.execute(
      `withdrawal-recover-paid:${payload.requestId}`,
      JSON.stringify(payload),
      async () => {
        await service.completePayout(payload.requestId);
        return 'paid';
      },
    );
    return 'paid';
  }

  if (info.status === 'FAILED') {
    await idempotencyService.execute(
      `withdrawal-recover-failed:${payload.requestId}`,
      JSON.stringify(payload),
      async () => {
        await service.failPayout(payload.requestId);
        return 'failed';
      },
    );
    return 'failed';
  }

  writeStructuredLog({
    event: 'withdrawal_recovery_pending',
    requestId: payload.requestId,
    status: info.status,
  });
  return 'unknown';
}

/**
 * Varre withdrawals em PROCESSING há mais de `minProcessingAgeMs` e — para cada
 * um — consulta o PSP em vez de refazer o pagamento. Barra uma operação por
 * vez; falha de item é logada e segue para o próximo.
 */
export async function runWithdrawalRecovery(options: {
  repository: IWithdrawalRequestRepository;
  service: WithdrawalRequestService;
  paymentAdapter?: IPaymentPort;
  minProcessingAgeMs?: number;
  limit?: number;
  now?: Date;
}): Promise<{ scanned: number; paid: number; failed: number; unknown: number; errors: number }> {
  const {
    repository,
    service,
    paymentAdapter,
    minProcessingAgeMs = 5 * 60 * 1000,
    limit = 50,
    now = new Date(),
  } = options;

  const processingBefore = new Date(now.getTime() - minProcessingAgeMs);
  const stuck = await repository.listStuckProcessing(processingBefore, limit);

  const summary = { scanned: stuck.length, paid: 0, failed: 0, unknown: 0, errors: 0 };
  for (const request of stuck) {
    const payload: WithdrawalPayoutPayload = {
      requestId: request.id,
      userId: request.userId,
      amount: request.amount,
      currency: request.currency,
    };
    try {
      const outcome = await recoverWithdrawalProcessing(payload, paymentAdapter, service);
      if (outcome === 'paid') summary.paid += 1;
      else if (outcome === 'failed') summary.failed += 1;
      else if (outcome === 'unknown') summary.unknown += 1;
      else summary.errors += 1;
    } catch (err) {
      summary.errors += 1;
      writeStructuredLog({
        event: 'withdrawal_recovery_failed',
        requestId: request.id,
        err,
      });
    }
  }

  writeStructuredLog({
    event: 'withdrawal_recovery_run',
    scanned: summary.scanned,
    paid: summary.paid,
    failed: summary.failed,
    unknown: summary.unknown,
    errors: summary.errors,
  });
  return summary;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const raw = Number(value);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/**
 * Scheduler periódico para recuperar withdrawals presos em PROCESSING (worker
 * morto, timeout do provedor etc). Consulta o PSP — nunca refaz o pagamento.
 */
export function startWithdrawalRecovery(options: {
  repository: IWithdrawalRequestRepository;
  service: WithdrawalRequestService;
  paymentAdapter?: IPaymentPort;
  intervalMs?: number;
  minProcessingAgeMs?: number;
  limit?: number;
}): { stop(): void } {
  const {
    repository,
    service,
    paymentAdapter,
    intervalMs = parsePositiveInt(process.env.WITHDRAWAL_RECOVERY_INTERVAL_MS, 5 * 60 * 1000),
    minProcessingAgeMs = parsePositiveInt(
      process.env.WITHDRAWAL_RECOVERY_MIN_AGE_MS,
      5 * 60 * 1000,
    ),
    limit = 50,
  } = options;

  let running = false;
  const tick = async (): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    try {
      await runWithdrawalRecovery({ repository, service, paymentAdapter, minProcessingAgeMs, limit });
    } catch (err) {
      writeStructuredLog({ event: 'withdrawal_recovery_scan_failed', err });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref();

  void tick();

  return { stop() { clearInterval(timer); } };
}

export function startWithdrawalWorker(service?: WithdrawalRequestService): BullQueue {
  const queue = new Queue('withdrawal_payouts', REDIS_URL) as BullQueue;

  queue.process('payout', async (job) => {
    return processWithdrawalPayload(job.data as WithdrawalPayoutPayload, undefined, service).then(
      () => Promise.resolve(),
    );
  });

  queue.on('failed', (job, err) => {
    writeStructuredLog({
      event: 'withdrawal_payout_job_failed',
      requestId: (job?.data as any)?.requestId,
      err,
    });
  });

  return queue;
}

export default startWithdrawalWorker;
