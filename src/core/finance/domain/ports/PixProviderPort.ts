import { Currency } from '../value-objects/Currency';

export type PixChargeStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELED' | 'REFUNDED';
export type PixPayoutStatus = 'PENDING' | 'COMPLETED' | 'FAILED';
export type PixWebhookEventType = 'PIX_PAID' | 'PIX_REFUNDED' | 'PIX_CANCELED';

export interface PixChargeRequest {
  userId: string;
  amount: number;
  currency: Currency;
  description?: string;
}

export interface PixChargeResponse {
  chargeId: string;
  reference: string;
  status: PixChargeStatus;
  qrCode: string;
  expiresAt: Date;
  provider: string;
}

export interface PixChargeSnapshot {
  chargeId: string;
  reference: string;
  userId: string;
  amount: number;
  currency: Currency;
  status: PixChargeStatus;
  expiresAt: Date;
  createdAt: Date;
  confirmedAt?: Date;
  provider: string;
}

export interface PixPaymentConfirmation {
  chargeId: string;
  reference: string;
  status: PixChargeStatus;
  confirmedAt: Date;
  provider: string;
}

export interface PixPayoutRequest {
  userId: string;
  amount: number;
  currency: Currency;
  pixKey: string;
  description?: string;
}

export interface PixPayoutResponse {
  payoutId: string;
  reference: string;
  status: PixPayoutStatus;
  processedAt: Date;
  provider: string;
}

/**
 * Evento de webhook enviado pelo PSP ao BackBet. O `rawBody` é o corpo cru
 * recebido (para a assinatura ser validada sobre os bytes exatos) e
 * `signature` é o header `X-BackBet-Signature` (HMAC-SHA256).
 */
export interface PixWebhookEvent {
  type: PixWebhookEventType;
  chargeId: string;
  reference: string;
  amount: number;
  currency: Currency;
  rawBody: string;
  signature: string;
}

export interface PixProviderPort {
  createCharge(input: PixChargeRequest): Promise<PixChargeResponse>;
  confirmPayment(chargeId: string): Promise<PixPaymentConfirmation>;
  initiatePayout(input: PixPayoutRequest): Promise<PixPayoutResponse>;
  /**
   * Consulta o estado atual de uma charge (para validação de webhook):
   * reference/amount/expiração/status. Retorna null se o PSP não conhece a
   * charge.
   */
  getCharge(chargeId: string): Promise<PixChargeSnapshot | null>;
  /**
   * Valida a assinatura HMAC de um webhook. Implementação mock usa o mesmo
   * segredo configurado (PIX_WEBHOOK_SECRET); um PSP real valida com o
   * esquema de assinatura do provedor.
   */
  verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean>;
  /**
   * Simula/registra o estorno de uma charge já paga (usado pelo fluxo de
   * refund/estorno do mock e por testes).
   */
  refundCharge(chargeId: string): Promise<PixChargeSnapshot | null>;
}