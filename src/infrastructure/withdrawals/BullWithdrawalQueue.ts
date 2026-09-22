import { Queue } from 'bullmq';
import IWithdrawalQueue, {
  WithdrawalPayoutPayload,
} from '@/core/finance/domain/ports/IWithdrawalQueue';
import { createBullMqConnection } from '@/infrastructure/queues/bullMqConnection';

export class BullWithdrawalQueue implements IWithdrawalQueue {
  private queue: Queue;

  constructor() {
    this.queue = new Queue('withdrawal_payouts', {
      connection: createBullMqConnection(),
    });
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