import { WithdrawalRequest } from '../entities/WithdrawalRequest';
import { IWithdrawalRequestRepository } from './IWithdrawalRequestRepository';

export class WithdrawalRequestRepository implements IWithdrawalRequestRepository {
  private requests: WithdrawalRequest[] = [];

  async create(request: WithdrawalRequest): Promise<WithdrawalRequest> {
    this.requests.push(request);
    return request;
  }

  async update(request: WithdrawalRequest): Promise<WithdrawalRequest> {
    const index = this.requests.findIndex((r) => r.id === request.id);
    if (index >= 0) {
      this.requests[index] = request;
    }
    return request;
  }

  async findById(id: string): Promise<WithdrawalRequest | null> {
    return this.requests.find((r) => r.id === id) || null;
  }

  async findByUserId(userId: string): Promise<WithdrawalRequest[]> {
    return this.requests.filter((r) => r.userId === userId);
  }

  async listPending(limit?: number, offset?: number): Promise<WithdrawalRequest[]> {
    const pending = this.requests.filter(
      (r) => r.status === 'REQUESTED' || r.status === 'VALIDATING',
    );
    return pending.slice(offset || 0, (offset || 0) + (limit || pending.length));
  }
}
