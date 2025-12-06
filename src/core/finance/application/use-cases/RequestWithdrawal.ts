import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { Currency } from '@/core/finance/domain/value-objects/Currency';
import { executeWithWalletErrorMapping } from '@/core/finance/application/errors/WalletErrorMapper';
import { UserService } from '@/core/user/domain/services/UserService';

export class RequestWithdrawal {
  constructor(
    private withdrawalRequestService: WithdrawalRequestService,
    private userService: UserService,
  ) {}

  async execute(userId: string, amount: number, currency: Currency, notes?: string) {
    const request = await executeWithWalletErrorMapping(() =>
      this.withdrawalRequestService.createRequest(userId, amount, currency, notes),
    );
    await this.verifyUserIfPending(userId);
    return request;
  }

  private async verifyUserIfPending(userId: string) {
    const user = await this.userService.findById(userId);
    if (!user || user.status !== 'PENDING_VERIFICATION') {
      return;
    }
    await this.userService.activateUser(userId);
  }
}
