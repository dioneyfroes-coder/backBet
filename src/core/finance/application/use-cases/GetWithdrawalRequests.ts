import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';

export class GetWithdrawalRequests {
  constructor(private withdrawalRequestService: WithdrawalRequestService) {}

  async execute(userId: string) {
    return this.withdrawalRequestService.listByUser(userId);
  }
}
