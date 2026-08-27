import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { treasuryReconciliationMismatchCounter } from '@/infrastructure/observability/metrics';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';

export type TreasuryReconciliationJobOptions = {
  intervalMs: number;
};

export class TreasuryReconciliationJob {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly treasuryService: HouseTreasuryService,
    private readonly options: TreasuryReconciliationJobOptions,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.runSafely();
    this.timer = setInterval(() => this.runSafely(), this.options.intervalMs);
    this.timer.unref?.();
    writeStructuredLog({ component: 'treasury-reconciliation-job', status: 'started' });
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
    writeStructuredLog({ component: 'treasury-reconciliation-job', status: 'stopped' });
  }

  private async runSafely(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const result = await this.treasuryService.reconcile();
      if (result.consistent) {
        writeStructuredLog({
          component: 'treasury-reconciliation-job',
          action: 'reconcile',
          consistent: true,
          walletId: result.walletId,
        });
        return;
      }
      treasuryReconciliationMismatchCounter.inc({ walletId: result.walletId });
      writeStructuredLog(
        {
          component: 'treasury-reconciliation-job',
          action: 'reconcile',
          consistent: false,
          walletId: result.walletId,
          checks: result.checks,
        },
        'warn',
      );
    } catch (error) {
      writeStructuredLog(
        {
          component: 'treasury-reconciliation-job',
          action: 'reconcile',
          error: error instanceof Error ? error.message : 'unknown',
        },
        'error',
      );
    } finally {
      this.running = false;
    }
  }
}