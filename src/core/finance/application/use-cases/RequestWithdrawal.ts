import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { Currency } from '@/core/finance/domain/value-objects/Currency';
import { executeWithWalletErrorMapping } from '@/core/finance/application/errors/WalletErrorMapper';
import { UserService } from '@/core/user/domain/services/UserService';
import { appConfig } from '@/shared/config/appConfig';
import { AppError } from '@/shared/errors/AppError';

export class RequestWithdrawal {
  constructor(
    private withdrawalRequestService: WithdrawalRequestService,
    private userService: UserService,
  ) {}

  async execute(
    userId: string,
    amount: number,
    currency: Currency,
    notes?: string,
    password?: string,
  ) {
    // If configured to require password for withdrawals, enforce it here
    if (appConfig.wallet.requireWithdrawPassword) {
      if (!password || password.trim().length === 0) {
        throw new AppError('FORBIDDEN', 'Password required to perform withdrawal', 403);
      }

      const user = await this.userService.findById(userId);
      if (!user) {
        throw new AppError('NOT_FOUND', 'User not found', 404);
      }
      const ok = await this.userService.comparePassword(user, password);
      if (!ok) {
        throw new AppError('FORBIDDEN', 'Invalid password', 403);
      }
    }

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
