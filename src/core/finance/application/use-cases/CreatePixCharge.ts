import { PixProviderPort } from '../../domain/ports/PixProviderPort';
import { Currency } from '../../domain/value-objects/Currency';
import { executeWithWalletErrorMapping } from '../errors/WalletErrorMapper';
import { MoneySecurityService } from '../../domain/services/MoneySecurityService';

/**
 * Cria uma charge Pix PENDING (QR Code) SEM creditar a carteira. O crédito só
 * ocorre quando o PSP enviar o webhook de confirmação (`PIX_PAID`) processado
 * por `ProcessPixWebhook`. Modela o fluxo assíncrono real de pagamentos: o
 * usuário recebe o QR agora, paga depois e o BackBet é notificado.
 */
export class CreatePixCharge {
  constructor(
    private pixProvider: PixProviderPort,
    private moneySecurity?: MoneySecurityService,
  ) {}

  async execute(userId: string, amount: number, currency: Currency, description?: string) {
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

    return { pixCharge: charge };
  }
}