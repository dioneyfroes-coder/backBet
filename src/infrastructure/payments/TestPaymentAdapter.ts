import IPaymentPort, { PaymentResult } from '@/core/finance/domain/ports/IPaymentPort';
import { Currency } from '@/core/finance/domain/value-objects/Currency';

export class TestPaymentAdapter implements IPaymentPort {
  private remainingFailures: number;
  public attempts = 0;

  constructor(failuresBeforeSuccess = 0) {
    this.remainingFailures = failuresBeforeSuccess;
  }

  async payWithdrawal(_requestId: string, _userId: string, _amount: number, _currency: Currency): Promise<PaymentResult> {
    this.attempts += 1;
    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      return { success: false, error: 'simulated_failure' };
    }
    return { success: true, transactionId: `test-tx-${Date.now()}` };
  }
}

export default TestPaymentAdapter;
