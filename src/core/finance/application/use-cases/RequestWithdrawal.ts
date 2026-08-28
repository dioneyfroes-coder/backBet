import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { WithdrawalRequest } from '@/core/finance/domain/entities/WithdrawalRequest';
import { Currency } from '@/core/finance/domain/value-objects/Currency';
import { executeWithWalletErrorMapping } from '@/core/finance/application/errors/WalletErrorMapper';
import { MoneySecurityService } from '@/core/finance/domain/services/MoneySecurityService';
import { User } from '@/core/user/domain/entities/User';
import { UserService } from '@/core/user/domain/services/UserService';
import { appConfig } from '@/shared/config/appConfig';
import { AppError } from '@/shared/errors/AppError';
import { IdempotencyService } from '@/shared/services/IdempotencyService';

export class RequestWithdrawal {
  constructor(
    private withdrawalRequestService: WithdrawalRequestService,
    private userService: UserService,
    private idempotency?: IdempotencyService,
    private moneySecurity?: MoneySecurityService,
  ) {}

  async execute(
    userId: string,
    amount: number,
    currency: Currency,
    notes?: string,
    password?: string,
    idempotencyKey?: string,
  ) {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }

    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'O valor do saque deve ser maior que zero', 400);
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

    const operation = async () => {
      if (this.moneySecurity) {
        await executeWithWalletErrorMapping(() =>
          this.moneySecurity!.assertWithdrawalAllowed(userId, amount, user.pixKey),
        );
      }
      const request = await executeWithWalletErrorMapping(() =>
        this.withdrawalRequestService.createRequest(userId, amount, currency, notes),
      );
      await this.verifyUserIfPending(user);
      return request;
    };
    if (!this.idempotency || !idempotencyKey) {
      return operation();
    }
    return this.idempotency.execute(
      `${userId}:withdrawal-request:${idempotencyKey}`,
      JSON.stringify({ userId, amount, currency, notes }),
      operation,
      (raw) =>
        new WithdrawalRequest(
          raw.id,
          raw.userId,
          raw.amount,
          raw.currency,
          new Date(raw.requestedAt),
          raw.status,
          raw.processedAt ? new Date(raw.processedAt) : undefined,
          raw.notes,
          raw.approvalLogs,
        ),
    );
  }

  private async verifyUserIfPending(user: User) {
    if (user.status !== 'PENDING_VERIFICATION') {
      return;
    }
    await this.userService.activateUser(user.id);
  }
}
