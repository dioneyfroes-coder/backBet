import { WalletService } from '../../domain/services/WalletService';
import { executeWithWalletErrorMapping } from '../errors/WalletErrorMapper';
import { PixProviderPort } from '../../domain/ports/PixProviderPort';
import { Currency } from '../../domain/value-objects/Currency';

export class Withdraw {
  constructor(
    private walletService: WalletService,
    private pixProvider: PixProviderPort,
  ) {}

  async execute(
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
