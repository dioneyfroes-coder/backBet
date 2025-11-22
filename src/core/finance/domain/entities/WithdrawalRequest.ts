import { AppError } from '@/shared/errors/AppError';
import { Currency } from '../value-objects/Currency';

export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ApprovalAction = 'APPROVED' | 'REJECTED';

export interface ApprovalLog {
  adminId: string;
  action: ApprovalAction;
  notes?: string;
  createdAt: Date;
}

export class WithdrawalRequest {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly amount: number,
    public readonly currency: Currency,
    public readonly requestedAt: Date = new Date(),
    public status: WithdrawalStatus = 'PENDING',
    public processedAt?: Date,
    public readonly notes?: string,
    public approvalLogs: ApprovalLog[] = [],
  ) {
    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Amount must be positive', 400);
    }
  }

  private addApprovalLog(adminId: string, action: ApprovalAction, notes?: string): void {
    if (this.status !== 'PENDING') {
      throw new AppError('BAD_REQUEST', 'Withdrawal request already processed', 400);
    }
    this.approvalLogs.push({ adminId, action, notes, createdAt: new Date() });
    this.status = action === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    this.processedAt = new Date();
  }

  approve(adminId: string, notes?: string): void {
    this.addApprovalLog(adminId, 'APPROVED', notes);
  }

  reject(adminId: string, notes?: string): void {
    this.addApprovalLog(adminId, 'REJECTED', notes);
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
      notes: this.notes,
      approvalLogs: this.approvalLogs,
    };
  }
}
