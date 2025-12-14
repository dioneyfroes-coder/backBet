import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { Currency } from '@/core/finance/domain/value-objects/Currency';
import { executeWithWalletErrorMapping } from '@/core/finance/application/errors/WalletErrorMapper';
import { User } from '@/core/user/domain/entities/User';
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
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }

    const preference = user.preferences?.requireWithdrawPassword;
    const shouldRequirePassword =
      typeof preference === 'boolean' ? preference : appConfig.wallet.requireWithdrawPassword;

    if (shouldRequirePassword) {
      if (!password || password.trim().length === 0) {
        throw new AppError('FORBIDDEN', 'Password required to perform withdrawal', 403);
      }

      const ok = await this.userService.comparePassword(user, password);
      if (!ok) {
        throw new AppError('FORBIDDEN', 'Invalid password', 403);
      }
    }

    const request = await executeWithWalletErrorMapping(() =>
      this.withdrawalRequestService.createRequest(userId, amount, currency, notes),
    );
    await this.verifyUserIfPending(user);
    return request;
  }

  private async verifyUserIfPending(user: User) {
    if (user.status !== 'PENDING_VERIFICATION') {
      return;
    }
    await this.userService.activateUser(user.id);
  }
}
