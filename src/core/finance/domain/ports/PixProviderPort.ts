import { Currency } from '../value-objects/Currency';

export type PixChargeStatus = 'PENDING' | 'PAID';
export type PixPayoutStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

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

export interface PixProviderPort {
  createCharge(input: PixChargeRequest): Promise<PixChargeResponse>;
  confirmPayment(chargeId: string): Promise<PixPaymentConfirmation>;
  initiatePayout(input: PixPayoutRequest): Promise<PixPayoutResponse>;
}
