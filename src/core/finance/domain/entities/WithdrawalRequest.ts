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

function decimalPlaces(value: number): number {
  const plain = value.toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: 20,
  });
  const dotIndex = plain.indexOf('.');
  return dotIndex === -1 ? 0 : plain.length - dotIndex - 1;
}

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

const ALLOWED_TRANSITIONS: Record<WithdrawalStatus, readonly WithdrawalStatus[]> = {
  REQUESTED: ['VALIDATING', 'CANCELED'],
  VALIDATING: ['APPROVED', 'REJECTED', 'CANCELED'],
  APPROVED: ['PROCESSING'],
  PROCESSING: ['COMPLETED', 'FAILED', 'REVERSED'],
  REJECTED: [],
  COMPLETED: ['REVERSED'],
  CANCELED: [],
  FAILED: ['PROCESSING'],
  REVERSED: [],
};

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
    public version: number = 1,
  ) {
    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Amount must be positive', 400);
    }
    if (decimalPlaces(amount) > 2) {
      throw new AppError('VALIDATION_ERROR', 'Amount must have at most 2 decimal places', 400);
    }
  }

  private transitionTo(next: WithdrawalStatus): void {
    const allowed = ALLOWED_TRANSITIONS[this.status];
    if (!allowed.includes(next)) {
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
    this.transitionTo('VALIDATING');
    void adminId;
  }

  approve(adminId: string, notes?: string): void {
    this.transitionTo('APPROVED');
    this.approvalLogs.push({ adminId, action: 'APPROVED', notes, createdAt: new Date() });
  }

  reject(adminId: string, notes?: string): void {
    this.transitionTo('REJECTED');
    this.approvalLogs.push({ adminId, action: 'REJECTED', notes, createdAt: new Date() });
  }

  markProcessing(): void {
    this.transitionTo('PROCESSING');
    // Marca quando o processamento iniciou (mantém o primeiro timestamp caso o
    // estado seja re-confirmado) para permitir recuperação de PROCESSING preso.
    this.processingAt = this.processingAt ?? new Date();
  }

  completePayout(): void {
    this.transitionTo('COMPLETED');
  }

  failPayout(): void {
    this.transitionTo('FAILED');
  }

  cancel(): void {
    this.transitionTo('CANCELED');
  }

  reverse(): void {
    this.transitionTo('REVERSED');
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
      version: this.version,
    };
  }

  clone(): WithdrawalRequest {
    return new WithdrawalRequest(
      this.id,
      this.userId,
      this.amount,
      this.currency,
      new Date(this.requestedAt),
      this.status,
      this.processedAt ? new Date(this.processedAt) : undefined,
      this.notes,
      this.approvalLogs.map((l) => ({ ...l })),
      this.processingAt ? new Date(this.processingAt) : undefined,
      this.version,
    );
  }
}
