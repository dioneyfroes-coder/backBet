process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

import { randomUUID } from 'crypto';
import { BullWithdrawalQueue } from '../BullWithdrawalQueue';
import type { WithdrawalPayoutPayload } from '@/core/finance/domain/ports/IWithdrawalQueue';
import * as BullMQ from 'bullmq';

const mockAdd = jest.fn();
const mockGetJobCounts = jest.fn();

jest.mock('@/infrastructure/queues/bullMqConnection', () => ({
  __esModule: true,
  createBullMqConnection: jest.fn(() => ({ host: 'localhost', port: 6379 })),
}));

jest.mock('bullmq', () => {
  return {
    Queue: jest.fn(function (this: any, name: string, opts: any) {
      this.name = name;
      this.opts = opts;
      this.add = mockAdd;
      this.getJobCounts = mockGetJobCounts;
    }),
    Worker: jest.fn(),
  };
});

const QueueCtor = BullMQ.Queue as unknown as jest.Mock;

const payload = (): WithdrawalPayoutPayload => ({
  requestId: randomUUID(),
  userId: 'user-x',
  amount: 100,
  currency: 'BRL',
});

describe('BullWithdrawalQueue (BullMQ)', () => {
  beforeEach(() => {
    mockAdd.mockReset();
    mockGetJobCounts.mockReset();
  });

  it('constrói a Queue BullMQ com a conexão do helper', () => {
    new BullWithdrawalQueue();
    expect(QueueCtor).toHaveBeenCalledWith(
      'withdrawal_payouts',
      expect.objectContaining({
        connection: expect.objectContaining({ host: 'localhost', port: 6379 }),
      }),
    );
  });

  it('getPendingCount soma waiting + active + delayed', async () => {
    mockGetJobCounts.mockResolvedValueOnce({ waiting: 2, active: 3, delayed: 1 });
    const queue = new BullWithdrawalQueue();
    await expect(queue.getPendingCount()).resolves.toBe(6);
  });

  it('getPendingCount trata ausência de chave como 0', async () => {
    mockGetJobCounts.mockResolvedValueOnce({ waiting: 2, active: 3 });
    const queue = new BullWithdrawalQueue();
    await expect(queue.getPendingCount()).resolves.toBe(5);
  });

  it('enqueuePayout usa jobId=requestId e a política de retry do antigo Bull', async () => {
    const p = payload();
    const queue = new BullWithdrawalQueue();
    await queue.enqueuePayout(p);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith('payout', p, {
      jobId: p.requestId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  });
});