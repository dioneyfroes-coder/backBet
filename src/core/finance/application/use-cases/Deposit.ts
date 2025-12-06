import { WalletService } from '../../domain/services/WalletService';
import { executeWithWalletErrorMapping } from '../errors/WalletErrorMapper';
import { PixProviderPort } from '../../domain/ports/PixProviderPort';
import { Currency } from '../../domain/value-objects/Currency';

export class Deposit {
  constructor(
    private walletService: WalletService,
    private pixProvider: PixProviderPort,
  ) {}

  async execute(userId: string, amount: number, currency: Currency, description?: string) {
    const charge = await this.pixProvider.createCharge({
      userId,
      amount,
      currency,
      description,
    });

    const confirmation = await this.pixProvider.confirmPayment(charge.chargeId);

    const wallet = await executeWithWalletErrorMapping(() =>
      this.walletService.deposit(userId, amount, {
        description: description ?? 'Depósito via Pix',
        metadata: {
          channel: 'PIX',
          pixChargeId: charge.chargeId,
          pixReference: confirmation.reference,
          pixProvider: confirmation.provider,
          pixQrCode: charge.qrCode,
          pixExpiresAt: charge.expiresAt.toISOString(),
          pixConfirmedAt: confirmation.confirmedAt.toISOString(),
        },
      }),
    );

    return { wallet, pixCharge: charge, pixConfirmation: confirmation };
  }
}
