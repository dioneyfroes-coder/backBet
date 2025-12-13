import { Currency } from '@/core/finance/domain/value-objects/Currency';

export type WithdrawalPayoutPayload = {
  requestId: string;
  userId: string;
  amount: number;
  currency: Currency;
};

export interface IWithdrawalQueue {
  enqueuePayout(payload: WithdrawalPayoutPayload): Promise<void>;
}

export default IWithdrawalQueue;
