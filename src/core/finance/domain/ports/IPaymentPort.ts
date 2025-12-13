import { Currency } from '@/core/finance/domain/value-objects/Currency';

export type PaymentResult = {
  success: boolean;
  transactionId?: string;
  error?: string;
};

export interface IPaymentPort {
  payWithdrawal(requestId: string, userId: string, amount: number, currency: Currency): Promise<PaymentResult>;
}

export default IPaymentPort;
