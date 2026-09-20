import { WithdrawalRequest, WithdrawalStatus } from '../entities/WithdrawalRequest';
import { TransactionSession } from '@/core/shared/types/Transaction';

export interface WithdrawalRequestTransitionGuard {
  status: WithdrawalStatus;
  version?: number;
}

export type WithdrawalRequestRepositoryOptions = {
  session?: TransactionSession;
  guard?: WithdrawalRequestTransitionGuard;
};

export interface IWithdrawalRequestRepository {
  create(
    request: WithdrawalRequest,
    options?: WithdrawalRequestRepositoryOptions,
  ): Promise<WithdrawalRequest>;
  update(request: WithdrawalRequest, options?: WithdrawalRequestRepositoryOptions): Promise<WithdrawalRequest>;
  claimForProcessing(
    requestId: string,
    options?: { session?: TransactionSession },
  ): Promise<WithdrawalRequest | null>;
  findById(id: string): Promise<WithdrawalRequest | null>;
  findByUserId(userId: string): Promise<WithdrawalRequest[]>;
  listPending(limit?: number, offset?: number): Promise<WithdrawalRequest[]>;
  listStuckProcessing(processingBefore: Date, limit?: number): Promise<WithdrawalRequest[]>;
  listStuckApproved(approvedBefore: Date, limit?: number): Promise<WithdrawalRequest[]>;
  withTransaction?<T>(work: (session: TransactionSession) => Promise<T>): Promise<T>;
}
