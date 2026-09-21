import IPaymentPort, { PaymentResult } from '@/core/finance/domain/ports/IPaymentPort';
import { Currency } from '@/core/finance/domain/value-objects/Currency';

export class TestPaymentAdapter implements IPaymentPort {
  private remainingFailures: number;
  public attempts = 0;
  private readonly paidByRequestId = new Map<string, string>();

  constructor(failuresBeforeSuccess = 0) {
    this.remainingFailures = failuresBeforeSuccess;
  }

  async payWithdrawal(
    requestId: string,
    _userId: string,
    _amount: number,
    _currency: Currency,
  ): Promise<PaymentResult> {
    // PSP idempotente (#4): requestId já pago retorna o MESMO transactionId,
    // sem recriar payout externo e sem consumir a contagem de falhas restantes.
    const paid = this.paidByRequestId.get(requestId);
    if (paid) {
      return { success: true, transactionId: paid };
    }
    this.attempts += 1;
    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      return { success: false, error: 'simulated_failure' };
    }
    const txId = `test-tx-${Date.now()}`;
    this.paidByRequestId.set(requestId, txId);
    return { success: true, transactionId: txId };
  }
}

export default TestPaymentAdapter;
