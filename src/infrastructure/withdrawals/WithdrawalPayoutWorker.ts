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

async function processWithdrawalPayloadOnce(
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
