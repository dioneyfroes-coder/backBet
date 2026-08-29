import { WalletService } from '../../domain/services/WalletService';
import { executeWithWalletErrorMapping } from '../errors/WalletErrorMapper';
import { PixProviderPort } from '../../domain/ports/PixProviderPort';
import { Currency } from '../../domain/value-objects/Currency';
import { IdempotencyService } from '@/shared/services/IdempotencyService';
import { MoneySecurityService } from '../../domain/services/MoneySecurityService';

export class Withdraw {
  constructor(
    private walletService: WalletService,
    private pixProvider: PixProviderPort,
    private idempotency?: IdempotencyService,
    private moneySecurity?: MoneySecurityService,
  ) {}

  async execute(
    userId: string,
    amount: number,
    currency: Currency,
    pixKey: string,
    description?: string,
    idempotencyKey?: string,
  ) {
    const operation = () => this.executeOnce(userId, amount, currency, pixKey, description);
    if (!this.idempotency || !idempotencyKey) {
      return { ...(await operation()), replayed: false };
    }
    const { value, replayed } = await this.idempotency.executeWithMeta(
      `${userId}:withdraw:${idempotencyKey}`,
      JSON.stringify({ userId, amount, currency, pixKey, description }),
      operation,
    );
    return { ...value, replayed };
  }

  private async executeOnce(
    userId: string,
    amount: number,
    currency: Currency,
    pixKey: string,
    description?: string,
  ) {
    if (this.moneySecurity) {
      await executeWithWalletErrorMapping(() =>
        this.moneySecurity!.assertWithdrawalAllowed(userId, amount, pixKey),
      );
    }

    const payout = await this.pixProvider.initiatePayout({
      userId,
      amount,
      currency,
      pixKey,
      description,
    });

    const wallet = await executeWithWalletErrorMapping(() =>
      this.walletService.withdraw(userId, amount, {
        type: 'WITHDRAWAL_COMPLETED',
        source: 'PIX',
        referenceId: payout.payoutId,
        description: description ?? 'Saque via Pix',
        metadata: {
          channel: 'PIX',
          pixPayoutId: payout.payoutId,
          pixReference: payout.reference,
          pixProvider: payout.provider,
          pixProcessedAt: payout.processedAt.toISOString(),
          pixKey,
        },
      }),
    );

    return { wallet, pixPayout: payout };
  }
}
