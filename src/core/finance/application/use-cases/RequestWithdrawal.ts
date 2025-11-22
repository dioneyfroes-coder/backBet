import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { Currency } from '@/core/finance/domain/value-objects/Currency';

export class RequestWithdrawal {
  constructor(private withdrawalRequestService: WithdrawalRequestService) {}

  async execute(userId: string, amount: number, currency: Currency, notes?: string) {
    return this.withdrawalRequestService.createRequest(userId, amount, currency, notes);
  }
}
