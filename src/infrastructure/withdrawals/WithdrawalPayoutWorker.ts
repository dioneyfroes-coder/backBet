import Queue from 'bull';
import type { Queue as BullQueue } from 'bull';
import { createPaymentAdapter } from '@/infrastructure/payments/factory';
import {
  withdrawalPayoutSuccessCounter,
  withdrawalPayoutFailedCounter,
} from '@/infrastructure/observability/metrics';
import type { WithdrawalPayoutPayload } from '@/core/finance/domain/ports/IWithdrawalQueue';
import type IPaymentPort from '@/core/finance/domain/ports/IPaymentPort';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { idempotencyService } from '@/shared/services/IdempotencyService';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

async function processWithdrawalPayloadOnce(
  payload: WithdrawalPayoutPayload,
  paymentAdapter?: IPaymentPort,
): Promise<void> {
  const adapter = paymentAdapter ?? createPaymentAdapter();
  try {
    const res = await adapter.payWithdrawal(
      payload.requestId,
      payload.userId,
      payload.amount,
      payload.currency,
    );
    if (res.success) {
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
    } else {
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
  } catch (err) {
    try {
      withdrawalPayoutFailedCounter.inc();
    } catch (e) {
      console.debug('withdrawalPayoutFailedCounter inc failed', e);
    }
    writeStructuredLog({ event: 'withdrawal_payout_error', requestId: payload.requestId, err });
    throw err;
  }
}

export async function processWithdrawalPayload(
  payload: WithdrawalPayoutPayload,
  paymentAdapter?: IPaymentPort,
): Promise<void> {
  await idempotencyService.execute(
    `withdrawal-payout:${payload.requestId}`,
    JSON.stringify(payload),
    () => processWithdrawalPayloadOnce(payload, paymentAdapter),
  );
}

export function startWithdrawalWorker(): BullQueue {
  const queue = new Queue('withdrawal_payouts', REDIS_URL) as BullQueue;

  queue.process('payout', async (job) => {
    return processWithdrawalPayload(job.data as WithdrawalPayoutPayload).then(() =>
      Promise.resolve(),
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
