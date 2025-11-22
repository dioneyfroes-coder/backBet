import { WithdrawalRequest } from '../entities/WithdrawalRequest';

export interface IWithdrawalRequestRepository {
  create(request: WithdrawalRequest): Promise<WithdrawalRequest>;
  update(request: WithdrawalRequest): Promise<WithdrawalRequest>;
  findById(id: string): Promise<WithdrawalRequest | null>;
  findByUserId(userId: string): Promise<WithdrawalRequest[]>;
  listPending(limit?: number, offset?: number): Promise<WithdrawalRequest[]>;
}
