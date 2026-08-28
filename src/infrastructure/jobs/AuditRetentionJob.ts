import { AuditService } from '@/core/audit/domain/services/AuditService';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';

export type AuditRetentionJobOptions = {
  intervalMs: number;
  retentionDays: number;
};

export class AuditRetentionJob {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly auditService: AuditService,
    private readonly options: AuditRetentionJobOptions,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.runSafely();
    this.timer = setInterval(() => this.runSafely(), this.options.intervalMs);
    this.timer.unref?.();
    writeStructuredLog({ component: 'audit-retention-job', status: 'started' });
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
    writeStructuredLog({ component: 'audit-retention-job', status: 'stopped' });
  }

  private async runSafely(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const deleted = await this.auditService.applyRetentionPolicy(this.options.retentionDays);
      writeStructuredLog({
        component: 'audit-retention-job',
        action: 'retention',
        retentionDays: this.options.retentionDays,
        deleted,
      });
    } catch (error) {
      writeStructuredLog(
        {
          component: 'audit-retention-job',
          action: 'retention',
          error: error instanceof Error ? error.message : 'unknown',
        },
        'error',
      );
    } finally {
      this.running = false;
    }
  }
}
