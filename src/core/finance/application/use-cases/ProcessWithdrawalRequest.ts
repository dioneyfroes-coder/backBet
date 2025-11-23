import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { ApprovalAction } from '@/core/finance/domain/entities/WithdrawalRequest';
import { executeWithWalletErrorMapping } from '@/core/finance/application/errors/WalletErrorMapper';

export class ProcessWithdrawalRequest {
  constructor(private withdrawalRequestService: WithdrawalRequestService) {}

  async execute(requestId: string, adminId: string, action: ApprovalAction, notes?: string) {
    return executeWithWalletErrorMapping(() =>
      this.withdrawalRequestService.processRequest(requestId, adminId, action, notes),
    );
  }
}
