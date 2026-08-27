import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';

export type TreasuryRebalanceJobOptions = {
  intervalMs: number;
  targetPrizeRatio: number;
  minProfitBuffer: number;
  maxTransferPerRun?: number;
};

export class TreasuryRebalanceJob {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly treasuryService: HouseTreasuryService,
    private readonly options: TreasuryRebalanceJobOptions,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.runSafely();
    this.timer = setInterval(() => this.runSafely(), this.options.intervalMs);
    this.timer.unref?.();
    writeStructuredLog({ component: 'treasury-rebalance-job', status: 'started' });
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
    writeStructuredLog({ component: 'treasury-rebalance-job', status: 'stopped' });
  }

  private async runSafely(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const { result } = await this.treasuryService.rebalance({
        targetPrizeRatio: this.options.targetPrizeRatio,
        minProfitBufferCents: Math.round(this.options.minProfitBuffer * 100),
        maxTransferCents: this.options.maxTransferPerRun
          ? Math.round(this.options.maxTransferPerRun * 100)
          : undefined,
      });
      writeStructuredLog({
        component: 'treasury-rebalance-job',
        action: 'rebalance',
        transferredAmountCents: result.transferredAmountCents,
        direction: result.direction,
        targetPrizeRatio: result.targetPrizeRatio,
      });
    } catch (error) {
      writeStructuredLog(
        {
          component: 'treasury-rebalance-job',
          action: 'rebalance',
          error: error instanceof Error ? error.message : 'unknown',
        },
        'error',
      );
    } finally {
      this.running = false;
    }
  }
}
