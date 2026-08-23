import { WalletService } from '../../domain/services/WalletService';
import { executeWithWalletErrorMapping } from '../errors/WalletErrorMapper';
import { PixProviderPort } from '../../domain/ports/PixProviderPort';
import { Currency } from '../../domain/value-objects/Currency';
import { IdempotencyService } from '@/shared/services/IdempotencyService';

export class Withdraw {
  constructor(
    private walletService: WalletService,
    private pixProvider: PixProviderPort,
    private idempotency?: IdempotencyService,
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
      return operation();
    }
    return this.idempotency.execute(
      `${userId}:withdraw:${idempotencyKey}`,
      JSON.stringify({ userId, amount, currency, pixKey, description }),
      operation,
    );
  }

  private async executeOnce(
    userId: string,
    amount: number,
    currency: Currency,
    pixKey: string,
    description?: string,
  ) {
    const payout = await this.pixProvider.initiatePayout({
      userId,
      amount,
      currency,
      pixKey,
      description,
    });

    const wallet = await executeWithWalletErrorMapping(() =>
      this.walletService.withdraw(userId, amount, {
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
