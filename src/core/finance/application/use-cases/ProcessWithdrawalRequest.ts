import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { ApprovalAction } from '@/core/finance/domain/entities/WithdrawalRequest';

export class ProcessWithdrawalRequest {
  constructor(private withdrawalRequestService: WithdrawalRequestService) {}

  async execute(requestId: string, adminId: string, action: ApprovalAction, notes?: string) {
    return this.withdrawalRequestService.processRequest(requestId, adminId, action, notes);
  }
}
