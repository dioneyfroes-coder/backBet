import { WalletService } from '../../domain/services/WalletService';
import { executeWithWalletErrorMapping } from '../errors/WalletErrorMapper';
import {
  PixProviderPort,
  PixWebhookEvent,
} from '../../domain/ports/PixProviderPort';
import { IdempotencyService } from '@/shared/services/IdempotencyService';
import { canonicalFingerprint } from '@/shared/services/fingerprint';
import { AppError } from '@/shared/errors/AppError';

export type ProcessPixWebhookResult = {
  action: 'credited' | 'replayed' | 'expired_ignored' | 'refunded' | 'canceled';
  wallet?: {
    userId: string;
    balance: number;
    lockedBalance: number;
    currency: string;
  };
  charge?: {
    chargeId: string;
    reference: string;
    status: string;
    provider: string;
  };
};

const toWalletDTO = (wallet: {
  userId: string;
  balance: number;
  lockedBalance: number;
  currency: string;
}) => ({
  userId: wallet.userId,
  balance: wallet.balance,
  lockedBalance: wallet.lockedBalance,
  currency: wallet.currency,
});

/**
 * Processa um webhook Pix enviado pelo PSP (provedor de pagamento).
 *
 * Regras (cenários P1-P7 da matriz crítica):
 *  - P2: assinatura HMAC inválida é rejeitada (401).
 *  - P7: reference do webhook deve casar com a charge criada (422).
 *  - P6: amount/currency do webhook devem casar com a charge (422).
 *  - P3: pagamento confirmado após expiração NÃO credita (ignorado).
 *  - P4: confirmação PIX_PAID credita o depósito na carteira.
 *  - P1: webhook duplicado (mesma charge + mesmo tipo) não credita 2x
 *        (guard de idempotência no ledger via `DEPOSIT:<chargeId>` + store).
 *  - P5: estorno/cancelamento debita o valor anteriormente creditado
 *        (tipo de ledger `PIX_REFUND`), ou apenas marca a charge quando
 *        nunca houve crédito.
 */
export class ProcessPixWebhook {
  constructor(
    private walletService: WalletService,
    private pixProvider: PixProviderPort,
    private idempotency?: IdempotencyService,
  ) {}

  async execute(event: PixWebhookEvent): Promise<ProcessPixWebhookResult> {
    const operation = () => this.executeOnce(event);
    if (!this.idempotency) {
      return operation();
    }
    const { value, replayed } = await this.idempotency.executeWithMeta(
      `pix-webhook:${event.chargeId}:${event.type}`,
      canonicalFingerprint({
        type: event.type,
        chargeId: event.chargeId,
        reference: event.reference,
        amount: event.amount,
        currency: event.currency,
      }),
      operation,
    );
    return replayed ? { ...value, action: 'replayed' } : value;
  }

  private async executeOnce(event: PixWebhookEvent): Promise<ProcessPixWebhookResult> {
    const signatureOk = await this.pixProvider.verifyWebhookSignature(
      event.rawBody,
      event.signature,
    );
    if (!signatureOk) {
      throw new AppError(
        'PIX_WEBHOOK_SIGNATURE_INVALID',
        'Assinatura inválida para o webhook Pix',
        401,
        { chargeId: event.chargeId },
      );
    }

    const charge = await this.pixProvider.getCharge(event.chargeId);
    if (!charge) {
      throw new AppError(
        'PIX_WEBHOOK_CHARGE_NOT_FOUND',
        'Charge Pix inexistente para o webhook',
        404,
        { chargeId: event.chargeId },
      );
    }

    if (charge.reference !== event.reference) {
      throw new AppError(
        'PIX_WEBHOOK_REFERENCE_MISMATCH',
        'Reference do webhook não corresponde à charge',
        422,
        { chargeId: event.chargeId, expected: charge.reference, got: event.reference },
      );
    }

    if (charge.amount !== event.amount || charge.currency !== event.currency) {
      throw new AppError(
        'PIX_WEBHOOK_AMOUNT_MISMATCH',
        'Valor do webhook não corresponde à charge',
        422,
        {
          chargeId: event.chargeId,
          expectedAmount: charge.amount,
          gotAmount: event.amount,
        },
      );
    }

    const chargeRef = {
      chargeId: charge.chargeId,
      reference: charge.reference,
      provider: charge.provider,
    };

    if (event.type === 'PIX_PAID') {
      // P3: pagamento atrasado (charge já expirada) NÃO credita.
      if (charge.status === 'EXPIRED') {
        return { action: 'expired_ignored', charge: { ...chargeRef, status: 'EXPIRED' } };
      }
      // P1: charge já paga => replay do webhook, sem novo crédito.
      if (charge.status === 'PAID') {
        return { action: 'replayed', charge: { ...chargeRef, status: 'PAID' } };
      }

      const wallet = await executeWithWalletErrorMapping(() =>
        this.walletService.deposit(charge.userId, charge.amount, {
          type: 'DEPOSIT',
          source: 'PIX',
          referenceId: charge.chargeId,
          description: 'Depósito via Pix confirmado por webhook',
          metadata: {
            channel: 'PIX',
            pixChargeId: charge.chargeId,
            pixReference: charge.reference,
            pixProvider: charge.provider,
            pixExpiresAt: charge.expiresAt.toISOString(),
            confirmedBy: 'webhook',
          },
        }),
      );
      await this.pixProvider.confirmPayment(charge.chargeId);
      return {
        action: 'credited',
        wallet: toWalletDTO(wallet),
        charge: { ...chargeRef, status: 'PAID' },
      };
    }

    // PIX_REFUNDED / PIX_CANCELED: estorno ou cancelamento.
    if (charge.status === 'PAID') {
      // Estorno de um depósito já creditado: debita com ledger do tipo PIX_REFUND.
      const wallet = await executeWithWalletErrorMapping(() =>
        this.walletService.withdraw(charge.userId, charge.amount, {
          type: 'PIX_REFUND',
          source: 'PIX',
          referenceId: charge.chargeId,
          description: 'Estorno Pix',
          metadata: {
            channel: 'PIX',
            pixChargeId: charge.chargeId,
            pixReference: charge.reference,
            pixProvider: charge.provider,
            refundBy: 'webhook',
          },
        }),
      );
      await this.pixProvider.refundCharge(charge.chargeId);
      return {
        action: 'refunded',
        wallet: toWalletDTO(wallet),
        charge: { ...chargeRef, status: 'REFUNDED' },
      };
    }

    // Nunca creditado (PENDING/EXPIRED): apenas reflete o estado no provedor.
    await this.pixProvider.refundCharge(charge.chargeId);
    return { action: 'canceled', charge: { ...chargeRef, status: 'REFUNDED' } };
  }
}