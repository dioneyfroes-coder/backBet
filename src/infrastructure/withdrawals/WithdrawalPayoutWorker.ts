import Queue from 'bull';
import type { Queue as BullQueue } from 'bull';
import { createPaymentAdapter } from '@/infrastructure/payments/factory';
import {
  withdrawalPayoutSuccessCounter,
  withdrawalPayoutFailedCounter,
} from '@/infrastructure/observability/metrics';
import {
  observeWorkerJob,
  recordWorkerRetry,
} from '@/infrastructure/observability/workerMetrics';
import type { WithdrawalPayoutPayload } from '@/core/finance/domain/ports/IWithdrawalQueue';
import type IWithdrawalQueue from '@/core/finance/domain/ports/IWithdrawalQueue';
import type IPaymentPort from '@/core/finance/domain/ports/IPaymentPort';
import type { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import type { IWithdrawalRequestRepository } from '@/core/finance/domain/repositories/IWithdrawalRequestRepository';
import type { AuditService } from '@/core/audit/domain/services/AuditService';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { IDEMPOTENCY_PROCESSING_RECOVERY_MS } from '@/shared/services/IdempotencyService';
import { idempotencyService } from '@/infrastructure/persistence/idempotencyFactory';
import { canonicalFingerprint } from '@/shared/services/fingerprint';
import { getRedisUrl } from '@/shared/config/connections';

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
  auditService?: AuditService,
): Promise<void> {
  const adapter = paymentAdapter ?? createPaymentAdapter();

  // Reflect APPROVED -> PROCESSING before contacting the provider (best effort).
  await markProcessingBestEffort(payload, service);

  let res;
  try {
    res = await adapter.payWithdrawal(
      payload.requestId,
      payload.userId,
      new Money(payload.amount, payload.currency).amount,
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

  // The external payout already succeeded. Emit exactly one best-effort audit
  // event BEFORE the state update; a queue retry is idempotent-guarded upstream
  // (idempotencyService), so the event is never duplicated, while 'record'
  // mis-fires never rethrow and thus never double-pay the user.
  if (auditService) {
    await auditService.record({
      type: 'FINANCIAL',
      action: 'withdrawal.payout.succeeded',
      actorUserId: payload.userId,
      actorRole: 'system',
      resourceType: 'withdrawalRequest',
      resourceId: payload.requestId,
      before: undefined,
      after: { transactionId: res.transactionId, amount: payload.amount, currency: payload.currency },
      reason: undefined,
      ip: undefined,
      requestId: undefined,
      severity: 'INFO',
      metadata: {
        tx: res.transactionId,
        amount: payload.amount,
        currency: payload.currency,
      },
    });
  }

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
    canonicalFingerprint(payload),
    () => processWithdrawalPayloadOnce(payload, paymentAdapter, service),
    undefined,
    IDEMPOTENCY_PROCESSING_RECOVERY_MS,
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
      canonicalFingerprint(payload),
      async () => {
        await service.completePayout(payload.requestId);
        return 'paid';
      },
      undefined,
      IDEMPOTENCY_PROCESSING_RECOVERY_MS,
    );
    return 'paid';
  }

  if (info.status === 'FAILED') {
    await idempotencyService.execute(
      `withdrawal-recover-failed:${payload.requestId}`,
      canonicalFingerprint(payload),
      async () => {
        await service.failPayout(payload.requestId);
        return 'failed';
      },
      undefined,
      IDEMPOTENCY_PROCESSING_RECOVERY_MS,
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
 * Recupera um withdrawal aprovado e preso (job de payout perdido: nunca foi
 * processado após o approve, ex.: enqueue perdido / worker morto antes de
 * marcar PROCESSING). Re-enfileira o job reutilizando o mesmo jobId=requestId,
 * que é idempotente na fila (Bull) e tem o processamento deduplicado pelo
 * idempotencyService no processWithdrawalPayload. Não consulta o PSP porque o
 * pagamento só acontece depois de markProcessing.
 */
export async function recoverStuckApproved(
  payload: WithdrawalPayoutPayload,
  withdrawalQueue?: IWithdrawalQueue,
): Promise<WithdrawalRecoveryOutcome | 'requeued'> {
  if (!withdrawalQueue) {
    writeStructuredLog({
      event: 'withdrawal_recovery_requeue_skipped',
      requestId: payload.requestId,
      reason: 'no_queue',
    });
    return 'unknown';
  }

  try {
    await withdrawalQueue.enqueuePayout(payload);
    writeStructuredLog({
      event: 'withdrawal_recovery_requeued',
      requestId: payload.requestId,
    });
    return 'requeued';
  } catch (err) {
    writeStructuredLog({
      event: 'withdrawal_recovery_requeue_failed',
      requestId: payload.requestId,
      err,
    });
    return 'error';
  }
}

/**
 * Varre withdrawals em PROCESSING há mais de `minProcessingAgeMs` e aprovados
 * em `APPROVED` (job perdido) há mais de `minApprovedAgeMs`. Para PROCESSING
 * consulta o PSP (nunca refaz o pagamento); para APPROVED re-enfileira o job.
 * Barra uma operação por vez; falha de item é logada e segue para o próximo.
 */
export async function runWithdrawalRecovery(options: {
  repository: IWithdrawalRequestRepository;
  service: WithdrawalRequestService;
  paymentAdapter?: IPaymentPort;
  minProcessingAgeMs?: number;
  minApprovedAgeMs?: number;
  limit?: number;
  now?: Date;
  withdrawalQueue?: IWithdrawalQueue;
}): Promise<{
  scanned: number;
  paid: number;
  failed: number;
  unknown: number;
  errors: number;
  approved: number;
  requeued: number;
}> {
  const {
    repository,
    service,
    paymentAdapter,
    minProcessingAgeMs = 5 * 60 * 1000,
    minApprovedAgeMs = 5 * 60 * 1000,
    limit = 50,
    now = new Date(),
    withdrawalQueue,
  } = options;

  const processingBefore = new Date(now.getTime() - minProcessingAgeMs);
  const stuck = await repository.listStuckProcessing(processingBefore, limit);

  const summary = {
    scanned: stuck.length,
    paid: 0,
    failed: 0,
    unknown: 0,
    errors: 0,
    approved: 0,
    requeued: 0,
  };
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

  const approvedBefore = new Date(now.getTime() - minApprovedAgeMs);
  const stuckApproved = await repository.listStuckApproved(approvedBefore, limit);
  summary.approved = stuckApproved.length;

  for (const request of stuckApproved) {
    const payload: WithdrawalPayoutPayload = {
      requestId: request.id,
      userId: request.userId,
      amount: request.amount,
      currency: request.currency,
    };
    try {
      const outcome = await recoverStuckApproved(payload, withdrawalQueue);
      if (outcome === 'requeued') summary.requeued += 1;
      else if (outcome === 'error') summary.errors += 1;
      else summary.unknown += 1;
    } catch (err) {
      summary.errors += 1;
      writeStructuredLog({
        event: 'withdrawal_recovery_approved_failed',
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
    approved: summary.approved,
    requeued: summary.requeued,
  });
  return summary;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const raw = Number(value);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/**
 * Scheduler periódico para recuperar withdrawals presos em PROCESSING (consulta
 * o PSP — nunca refaz o pagamento) e APPROVED com job perdido (re-enfileira via
 * withdrawalQueue quando disponível). Permite retomada após kill -9: no restart
 * os jobs ainda não processados voltam a ser enfileirados.
 */
export function startWithdrawalRecovery(options: {
  repository: IWithdrawalRequestRepository;
  service: WithdrawalRequestService;
  paymentAdapter?: IPaymentPort;
  withdrawalQueue?: IWithdrawalQueue;
  intervalMs?: number;
  minProcessingAgeMs?: number;
  minApprovedAgeMs?: number;
  limit?: number;
}): { stop(): void } {
  const {
    repository,
    service,
    paymentAdapter,
    withdrawalQueue,
    intervalMs = parsePositiveInt(process.env.WITHDRAWAL_RECOVERY_INTERVAL_MS, 5 * 60 * 1000),
    minProcessingAgeMs = parsePositiveInt(
      process.env.WITHDRAWAL_RECOVERY_MIN_AGE_MS,
      5 * 60 * 1000,
    ),
    minApprovedAgeMs = parsePositiveInt(
      process.env.WITHDRAWAL_RECOVERY_MIN_APPROVED_AGE_MS,
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
      await runWithdrawalRecovery({
        repository,
        service,
        paymentAdapter,
        withdrawalQueue,
        minProcessingAgeMs,
        minApprovedAgeMs,
        limit,
      });
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
  const queue = new Queue('withdrawal_payouts', getRedisUrl()) as BullQueue;

  queue.process('payout', async (job) => {
    const started = process.hrtime();
    if (job.attemptsMade > 0) {
      recordWorkerRetry('withdrawal_payouts');
    }
    try {
      await processWithdrawalPayload(job.data as WithdrawalPayoutPayload, undefined, service);
      observeWorkerJob('withdrawal_payouts', 'payout', 'succeeded', jobElapsedMs(started));
      return Promise.resolve();
    } catch (err) {
      observeWorkerJob('withdrawal_payouts', 'payout', 'failed', jobElapsedMs(started));
      throw err;
    }
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

const jobElapsedMs = (started: [number, number]): number => {
  const delta = process.hrtime(started);
  return delta[0] * 1000 + delta[1] / 1e6;
};

export default startWithdrawalWorker;
