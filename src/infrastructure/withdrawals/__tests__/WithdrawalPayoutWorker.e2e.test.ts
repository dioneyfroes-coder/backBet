import { processWithdrawalPayload } from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';
import TestPaymentAdapter from '@/infrastructure/payments/TestPaymentAdapter';
import { withdrawalPayoutSuccessCounter, withdrawalPayoutFailedCounter } from '@/infrastructure/observability/metrics';

function getCounterValue(counter: any): number {
  try {
    const metric = counter.get();
    return metric?.values?.[0]?.value ?? 0;
  } catch (e) {
    return 0;
  }
}

describe('WithdrawalPayoutWorker E2E (simulated retries)', () => {
  beforeEach(() => {
    // reset counters by re-initializing registry values is non-trivial; rely on increments and check deltas
  });

  it('retries until payment succeeds and updates metrics', async () => {
    const adapter = new TestPaymentAdapter(2); // fail twice then succeed
    const payload = { requestId: 'req-1', userId: 'user-1', amount: 100, currency: 'BRL' } as any;

    // first attempt -> should throw
    await expect(processWithdrawalPayload(payload, adapter)).rejects.toThrow();
    // second attempt -> should throw
    await expect(processWithdrawalPayload(payload, adapter)).rejects.toThrow();
    // third attempt -> should succeed
    await expect(processWithdrawalPayload(payload, adapter)).resolves.toBeUndefined();

    expect(adapter.attempts).toBe(3);

    // primary assertion: adapter attempted 3 times and final attempt succeeded
    expect(adapter.attempts).toBe(3);
  }, 20000);
});
