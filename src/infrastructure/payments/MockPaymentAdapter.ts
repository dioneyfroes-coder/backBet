import IPaymentPort, {
  PaymentResult,
  WithdrawalStatus,
  WithdrawalStatusInfo,
} from '@/core/finance/domain/ports/IPaymentPort';
import { Currency } from '@/core/finance/domain/value-objects/Currency';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type MockPaymentOptions = {
  attempts?: number;
  baseBackoffMs?: number;
  jitterMs?: number;
  /**
   * Status forçado por requestId (testes/demo determinísticos). Quando ausente,
   * o adapter deduz do histórico de payWithdrawal: sucesso => PAID, falha => FAILED,
   * operação nunca vista => UNKNOWN.
   */
  manualStatusByRequestId?: Record<string, WithdrawalStatus>;
};

export class MockPaymentAdapter implements IPaymentPort {
  private attempts: number;
  private baseBackoffMs: number;
  private jitterMs: number;
  private readonly manualStatusByRequestId: Record<string, WithdrawalStatus>;
  private readonly registry = new Map<
    string,
    { paid: boolean; transactionId?: string; error?: string }
  >();

  constructor(options: MockPaymentOptions = {}) {
    this.attempts = options.attempts ?? 3;
    this.baseBackoffMs = options.baseBackoffMs ?? 500; // initial backoff
    this.jitterMs = options.jitterMs ?? 200;
    this.manualStatusByRequestId = options.manualStatusByRequestId ?? {};
  }

  async payWithdrawal(
    requestId: string,
    userId: string,
    amount: number,
    currency: Currency,
  ): Promise<PaymentResult> {
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
        this.registry.set(requestId, { paid: true, transactionId: txId });
        return { success: true, transactionId: txId };
      } catch (err: any) {
        const backoff = this.baseBackoffMs * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * this.jitterMs);
        const waitMs = backoff + jitter;
        // last attempt -> return failure
        if (attempt === this.attempts) {
          this.registry.set(requestId, { paid: false, error: err?.message ?? 'unknown' });
          return { success: false, error: err?.message ?? 'unknown' };
        }
        // otherwise wait and retry
        await wait(waitMs);
      }
    }
    this.registry.set(requestId, { paid: false, error: 'unknown' });
    return { success: false, error: 'unknown' };
  }

  async getWithdrawalStatus(requestId: string): Promise<WithdrawalStatusInfo> {
    const override = this.manualStatusByRequestId[requestId];
    if (override !== undefined) {
      return { status: override };
    }
    const record = this.registry.get(requestId);
    if (!record) {
      // A operação nunca chegou ao provedor (ou o provedor não tem registro).
      return { status: 'UNKNOWN' };
    }
    if (record.paid) {
      return { status: 'PAID', transactionId: record.transactionId };
    }
    return { status: 'FAILED', error: record.error };
  }

  /**
   * Permite simular "timeout depois de o PSP já ter pago": o worker morreu antes
   * da resposta, mas a operação realmente foi executada no provedor.
   */
  simulatePaid(requestId: string, transactionId?: string): void {
    this.registry.set(requestId, { paid: true, transactionId: transactionId ?? `mock-tx-${requestId}` });
  }

  simulateFailed(requestId: string, error?: string): void {
    this.registry.set(requestId, { paid: false, error: error ?? 'payout_failed' });
  }
}

export default MockPaymentAdapter;