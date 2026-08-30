import { AppError } from '@/shared/errors/AppError';
import { Currency } from '../value-objects/Currency';

export type WithdrawalStatus =
  | 'REQUESTED'
  | 'VALIDATING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'CANCELED'
  | 'FAILED'
  | 'REVERSED';

export type ApprovalAction = 'APPROVED' | 'REJECTED';

export interface ApprovalLog {
  adminId: string;
  action: ApprovalAction;
  notes?: string;
  createdAt: Date;
}

const TERMINAL_STATUSES: ReadonlySet<WithdrawalStatus> = new Set<WithdrawalStatus>([
  'REJECTED',
  'COMPLETED',
  'CANCELED',
  'FAILED',
  'REVERSED',
]);

export class WithdrawalRequest {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly amount: number,
    public readonly currency: Currency,
    public readonly requestedAt: Date = new Date(),
    public status: WithdrawalStatus = 'REQUESTED',
    public processedAt?: Date,
    public readonly notes?: string,
    public approvalLogs: ApprovalLog[] = [],
    public processingAt?: Date,
  ) {
    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Amount must be positive', 400);
    }
  }

  private transitionTo(next: WithdrawalStatus, allowed: ReadonlyArray<WithdrawalStatus>): void {
    if (!allowed.includes(this.status)) {
      throw new AppError(
        'CONFLICT',
        `Invalid withdrawal state transition: ${this.status} -> ${next}`,
        409,
      );
    }
    this.status = next;
    this.processedAt = new Date();
  }

  get isTerminal(): boolean {
    return TERMINAL_STATUSES.has(this.status);
  }

  validateBy(adminId: string): void {
    this.transitionTo('VALIDATING', ['REQUESTED']);
    void adminId;
  }

  approve(adminId: string, notes?: string): void {
    this.transitionTo('APPROVED', ['VALIDATING']);
    this.approvalLogs.push({ adminId, action: 'APPROVED', notes, createdAt: new Date() });
  }

  reject(adminId: string, notes?: string): void {
    this.transitionTo('REJECTED', ['VALIDATING']);
    this.approvalLogs.push({ adminId, action: 'REJECTED', notes, createdAt: new Date() });
  }

  markProcessing(): void {
    this.transitionTo('PROCESSING', ['APPROVED']);
    // Marca quando o processamento iniciou (mantém o primeiro timestamp caso o
    // estado seja re-confirmado) para permitir recuperação de PROCESSING preso.
    this.processingAt = this.processingAt ?? new Date();
  }

  completePayout(): void {
    this.transitionTo('COMPLETED', ['PROCESSING']);
  }

  failPayout(): void {
    this.transitionTo('FAILED', ['PROCESSING']);
  }

  cancel(): void {
    this.transitionTo('CANCELED', ['REQUESTED', 'VALIDATING']);
  }

  reverse(): void {
    this.transitionTo('REVERSED', ['PROCESSING', 'COMPLETED']);
  }

  toDTO() {
    return {
      id: this.id,
      userId: this.userId,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
      requestedAt: this.requestedAt,
      processedAt: this.processedAt,
      processingAt: this.processingAt,
      notes: this.notes,
      approvalLogs: this.approvalLogs,
    };
  }
}
