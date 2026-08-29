import type IWithdrawalQueue from '@/core/finance/domain/ports/IWithdrawalQueue';
import { withdrawalQueueBacklogGauge } from '@/infrastructure/observability/metrics';

let pollingInterval: NodeJS.Timeout | null = null;

const sampleBacklog = async (queue: IWithdrawalQueue): Promise<void> => {
  if (!queue.getPendingCount) {
    withdrawalQueueBacklogGauge.set(0);
    return;
  }
  try {
    withdrawalQueueBacklogGauge.set(await queue.getPendingCount());
  } catch {
    withdrawalQueueBacklogGauge.set(-1);
  }
};

export const startWithdrawalQueueBacklogPolling = (
  queue: IWithdrawalQueue,
  intervalMs = 15000,
): void => {
  if (pollingInterval) return;
  void sampleBacklog(queue);
  pollingInterval = setInterval(() => void sampleBacklog(queue), intervalMs);
};

export const stopWithdrawalQueueBacklogPolling = (): void => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
};