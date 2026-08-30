import { Currency } from '@/core/finance/domain/value-objects/Currency';

export type PaymentResult = {
  success: boolean;
  transactionId?: string;
  error?: string;
};

export type WithdrawalStatus = 'PAID' | 'FAILED' | 'UNKNOWN' | 'PROCESSING';

export type WithdrawalStatusInfo = {
  status: WithdrawalStatus;
  transactionId?: string;
  error?: string;
};

export interface IPaymentPort {
  payWithdrawal(
    requestId: string,
    userId: string,
    amount: number,
    currency: Currency,
  ): Promise<PaymentResult>;
  /**
   * Consulta o status de uma operação no PSP. Necessário para recuperar
   * withdrawals presos em PROCESSING sem refazer o pagamento (retry cego).
   * Opcional: adapters sem suporte retornam UNKNOWN/indefinido.
   */
  getWithdrawalStatus?(requestId: string): Promise<WithdrawalStatusInfo>;
}

export default IPaymentPort;
