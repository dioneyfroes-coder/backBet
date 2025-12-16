import type IWithdrawalQueue from '@/core/finance/domain/ports/IWithdrawalQueue';
import type { WithdrawalPayoutPayload } from '@/core/finance/domain/ports/IWithdrawalQueue';
import { processWithdrawalPayload } from './WithdrawalPayoutWorker';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';

export class InMemoryWithdrawalQueue implements IWithdrawalQueue {
  async enqueuePayout(payload: WithdrawalPayoutPayload): Promise<void> {
    // Process asynchronously but in-process. This is a best-effort fallback when Redis/Bull
    // is not available (dev/test or degraded environments). We intentionally don't await
    // here to keep API latency small; errors are logged and surfaced via metrics in the worker.
    setImmediate(() => {
      processWithdrawalPayload(payload).catch((err) => {
        writeStructuredLog({
          event: 'inmemory_withdrawal_payout_error',
          requestId: payload.requestId,
          err,
        });
      });
    });
  }
}

export default InMemoryWithdrawalQueue;
