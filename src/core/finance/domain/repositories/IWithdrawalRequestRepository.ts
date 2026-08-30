import { WithdrawalRequest } from '../entities/WithdrawalRequest';
import { TransactionSession } from '@/core/shared/types/Transaction';

export type WithdrawalRequestRepositoryOptions = { session?: TransactionSession };

export interface IWithdrawalRequestRepository {
  create(
    request: WithdrawalRequest,
    options?: WithdrawalRequestRepositoryOptions,
  ): Promise<WithdrawalRequest>;
  update(request: WithdrawalRequest): Promise<WithdrawalRequest>;
  findById(id: string): Promise<WithdrawalRequest | null>;
  findByUserId(userId: string): Promise<WithdrawalRequest[]>;
  listPending(limit?: number, offset?: number): Promise<WithdrawalRequest[]>;
  listStuckProcessing(processingBefore: Date, limit?: number): Promise<WithdrawalRequest[]>;
  withTransaction?<T>(work: (session: TransactionSession) => Promise<T>): Promise<T>;
}
