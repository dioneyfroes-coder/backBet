import IPaymentPort, { PaymentResult } from '@/core/finance/domain/ports/IPaymentPort';
import { Currency } from '@/core/finance/domain/value-objects/Currency';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type MockPaymentOptions = {
  attempts?: number;
  baseBackoffMs?: number;
  jitterMs?: number;
};

export class MockPaymentAdapter implements IPaymentPort {
  private attempts: number;
  private baseBackoffMs: number;
  private jitterMs: number;

  constructor(options: MockPaymentOptions = {}) {
    this.attempts = options.attempts ?? 3;
    this.baseBackoffMs = options.baseBackoffMs ?? 500; // initial backoff
    this.jitterMs = options.jitterMs ?? 200;
  }

  async payWithdrawal(requestId: string, userId: string, amount: number, currency: Currency): Promise<PaymentResult> {
    // Simulate network call with retries + exponential backoff + jitter
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        // simulate variable latency
        const latency = this.baseBackoffMs + Math.floor(Math.random() * this.jitterMs);
        await wait(latency);

        // Simulate transient failure on first attempts randomly
        const fail = Math.random() < 0.25 && attempt < this.attempts;
        if (fail) {
          throw new Error('Simulated transient payment gateway failure');
        }

        // Success
        const txId = `mock-tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        return { success: true, transactionId: txId };
      } catch (err: any) {
        const backoff = this.baseBackoffMs * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * this.jitterMs);
        const waitMs = backoff + jitter;
        // last attempt -> return failure
        if (attempt === this.attempts) {
          return { success: false, error: err?.message ?? 'unknown' };
        }
        // otherwise wait and retry
        await wait(waitMs);
      }
    }
    return { success: false, error: 'unknown' };
  }
}

export default MockPaymentAdapter;
