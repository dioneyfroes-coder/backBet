import { processWithdrawalPayload } from '../WithdrawalPayoutWorker';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import type IPaymentPort from '@/core/finance/domain/ports/IPaymentPort';

describe('WithdrawalPayoutWorker state transitions', () => {
  let service: any;
  let adapter: any;

  beforeEach(() => {
    service = {
      markProcessing: jest.fn().mockResolvedValue(undefined),
      completePayout: jest.fn().mockResolvedValue(undefined),
    };
    adapter = {
      payWithdrawal: jest.fn(),
    };
  });

  it('marks PROCESSING and COMPLETED when the payout succeeds', async () => {
    adapter.payWithdrawal.mockResolvedValue({ success: true, transactionId: 'tx-1' });
    const payload = { requestId: 'req-succ-1', userId: 'user-1', amount: 100, currency: 'BRL' } as any;

    await processWithdrawalPayload(payload, adapter as IPaymentPort, service as WithdrawalRequestService);

    expect(service.markProcessing).toHaveBeenCalledWith('req-succ-1');
    expect(service.completePayout).toHaveBeenCalledWith('req-succ-1');
    expect(adapter.payWithdrawal).toHaveBeenCalledTimes(1);
  });

  it('does NOT completePayout when the payout fails (future state will be FAILED)', async () => {
    adapter.payWithdrawal.mockResolvedValue({ success: false, error: 'provider_error' });
    const payload = { requestId: 'req-fail-1', userId: 'user-1', amount: 100, currency: 'BRL' } as any;

    await expect(
      processWithdrawalPayload(payload, adapter as IPaymentPort, service as WithdrawalRequestService),
    ).rejects.toThrow('provider_error');

    expect(service.markProcessing).toHaveBeenCalledWith('req-fail-1');
    expect(service.completePayout).not.toHaveBeenCalled();
  });

  it('never re-runs the payment adapter when the state update fails after a successful payout', async () => {
    adapter.payWithdrawal.mockResolvedValue({ success: true, transactionId: 'tx-2' });
    service.markProcessing.mockRejectedValue(new Error('state failed'));
    service.completePayout.mockRejectedValue(new Error('persist failed'));
    const payload = { requestId: 'req-guard-1', userId: 'user-1', amount: 50, currency: 'BRL' } as any;

    // Must resolve gracefully (state errors are swallowed) so the queue does NOT
    // retry and double-pay the user.
    await expect(
      processWithdrawalPayload(payload, adapter as IPaymentPort, service as WithdrawalRequestService),
    ).resolves.toBeUndefined();
    expect(adapter.payWithdrawal).toHaveBeenCalledTimes(1);
  });
});
