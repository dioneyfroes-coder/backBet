import { WalletService } from '../../domain/services/WalletService';
import { executeWithWalletErrorMapping } from '../errors/WalletErrorMapper';
import { PixProviderPort } from '../../domain/ports/PixProviderPort';
import { Currency } from '../../domain/value-objects/Currency';
import { IdempotencyService } from '@/shared/services/IdempotencyService';
import { MoneySecurityService } from '../../domain/services/MoneySecurityService';
import { ResponsibleGamblingService } from '@/core/responsibleGambling/domain/services/ResponsibleGamblingService';

export class Deposit {
  constructor(
    private walletService: WalletService,
    private pixProvider: PixProviderPort,
    private idempotency?: IdempotencyService,
    private moneySecurity?: MoneySecurityService,
    private responsibleGambling?: ResponsibleGamblingService,
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
    const amountCents = Math.round(amount * 100);
    if (this.moneySecurity) {
      await executeWithWalletErrorMapping(() =>
        this.moneySecurity!.assertDepositAllowed(userId, amount),
      );
    }

    if (this.responsibleGambling) {
      await executeWithWalletErrorMapping(() =>
        this.responsibleGambling!.assertCanDeposit(userId, amountCents),
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

    if (this.responsibleGambling) {
      await this.responsibleGambling
        .recordDeposit(userId, amountCents)
        .catch((err) => console.warn('recordDeposit failed', err));
    }

    return { wallet, pixCharge: charge, pixConfirmation: confirmation };
  }
}
