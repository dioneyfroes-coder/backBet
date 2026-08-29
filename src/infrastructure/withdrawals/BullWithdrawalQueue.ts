import Queue from 'bull';
import type { Queue as BullQueue } from 'bull';
import IWithdrawalQueue, {
  WithdrawalPayoutPayload,
} from '@/core/finance/domain/ports/IWithdrawalQueue';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export class BullWithdrawalQueue implements IWithdrawalQueue {
  private queue: BullQueue;

  constructor() {
    this.queue = new Queue('withdrawal_payouts', REDIS_URL) as BullQueue;
  }

  async getPendingCount(): Promise<number> {
    const counts = await this.queue.getJobCounts();
    return (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
  }

  async enqueuePayout(payload: WithdrawalPayoutPayload): Promise<void> {
    // use jobId = requestId for idempotency
    await this.queue.add('payout', payload, {
      jobId: payload.requestId,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 500,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}

export default BullWithdrawalQueue;
