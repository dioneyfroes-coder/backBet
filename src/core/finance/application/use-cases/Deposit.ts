import { WalletService } from '../../domain/services/WalletService';
import { executeWithWalletErrorMapping } from '../errors/WalletErrorMapper';
import { PixProviderPort } from '../../domain/ports/PixProviderPort';
import { Currency } from '../../domain/value-objects/Currency';
import { IdempotencyService } from '@/shared/services/IdempotencyService';
import { MoneySecurityService } from '../../domain/services/MoneySecurityService';

export class Deposit {
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
    description?: string,
    idempotencyKey?: string,
  ) {
    const operation = () => this.executeOnce(userId, amount, currency, description);
    if (!this.idempotency || !idempotencyKey) {
      return operation();
    }
    return this.idempotency.execute(
      `${userId}:deposit:${idempotencyKey}`,
      JSON.stringify({ userId, amount, currency, description }),
      operation,
    );
  }

  private async executeOnce(userId: string, amount: number, currency: Currency, description?: string) {
    if (this.moneySecurity) {
      await executeWithWalletErrorMapping(() =>
        this.moneySecurity!.assertDepositAllowed(userId, amount),
      );
    }

    const charge = await this.pixProvider.createCharge({
      userId,
      amount,
      currency,
      description,
    });

    const confirmation = await this.pixProvider.confirmPayment(charge.chargeId);

    const wallet = await executeWithWalletErrorMapping(() =>
      this.walletService.deposit(userId, amount, {
        type: 'DEPOSIT',
        source: 'PIX',
        referenceId: charge.chargeId,
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
