process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

import { randomUUID } from 'crypto';
import {
  processWithdrawalPayloadOnce,
  runWithdrawalRecovery,
  startWithdrawalRecovery,
  startWithdrawalWorker,
} from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';
import {
  withdrawalPayoutSuccessCounter,
  withdrawalPayoutFailedCounter,
} from '@/infrastructure/observability/metrics';
import type { WithdrawalPayoutPayload } from '@/core/finance/domain/ports/IWithdrawalQueue';
import * as BullMQ from 'bullmq';

jest.mock('@/infrastructure/payments/factory', () => ({
  __esModule: true,
  createPaymentAdapter: () => ({
    payWithdrawal: jest.fn().mockResolvedValue({ success: true, transactionId: 'tx-factory' }),
  }),
}));

jest.mock('@/infrastructure/queues/bullMqConnection', () => ({
  __esModule: true,
  createBullMqConnection: () => ({ host: 'localhost', port: 6379 }),
}));

jest.mock('bullmq', () => {
  return {
    Worker: jest.fn(function (this: any, name: string, processor: any, opts: any) {
      this.name = name;
      this.processor = processor;
      this.opts = opts;
      this.on = jest.fn();
      this.close = jest.fn().mockResolvedValue(undefined);
    }),
  };
});

const payload = (): WithdrawalPayoutPayload => ({
  requestId: randomUUID(),
  userId: 'user-x',
  amount: 100,
  currency: 'BRL',
});

describe('WithdrawalPayoutWorker — falha das métricas é best-effort', () => {
  let service: any;
  let adapter: any;

  beforeEach(() => {
    service = {
      completePayout: jest.fn().mockResolvedValue(undefined),
      claimForProcessing: jest.fn().mockResolvedValue({ status: 'PROCESSING' }),
    };
    adapter = { payWithdrawal: jest.fn() };
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('payWithdrawal lança: inc falha não mascara o erro original', async () => {
    jest
      .spyOn(withdrawalPayoutFailedCounter, 'inc')
      .mockImplementation(() => {
        throw new Error('metrics down');
      });
    adapter.payWithdrawal.mockRejectedValue(new Error('provider boom'));

    await expect(processWithdrawalPayloadOnce(payload(), adapter, service)).rejects.toThrow(
      'provider boom',
    );
    expect(console.debug).toHaveBeenCalled();
  });

  it('payout rejeitado: inc falha não mascara a falha', async () => {
    jest
      .spyOn(withdrawalPayoutFailedCounter, 'inc')
      .mockImplementation(() => {
        throw new Error('metrics down');
      });
    adapter.payWithdrawal.mockResolvedValue({ success: false, error: 'declined' });

    await expect(processWithdrawalPayloadOnce(payload(), adapter, service)).rejects.toThrow(
      'declined',
    );
    expect(console.debug).toHaveBeenCalled();
  });

  it('payout ok: inc de sucesso falha não derruba o fluxo', async () => {
    jest
      .spyOn(withdrawalPayoutSuccessCounter, 'inc')
      .mockImplementation(() => {
        throw new Error('metrics down');
      });
    adapter.payWithdrawal.mockResolvedValue({ success: true, transactionId: 'tx-ok' });

    await expect(processWithdrawalPayloadOnce(payload(), adapter, service)).resolves.toBeUndefined();
    expect(service.completePayout).toHaveBeenCalled();
    expect(console.debug).toHaveBeenCalled();
  });
});

describe('WithdrawalPayoutWorker — runWithdrawalRecovery isola item que lança', () => {
  it('conta erro e segue para o próximo item', async () => {
    const repository = {
      listStuckApproved: jest.fn(async () => []),
      listStuckProcessing: jest.fn(async () => [
        { id: randomUUID(), userId: 'user-x', amount: 100, currency: 'BRL' },
      ]),
    };
    const adapter = {
      getWithdrawalStatus: jest.fn(async () => ({ status: 'PAID', transactionId: 'tx-1' })),
    };
    const service = {
      completePayout: jest.fn(async () => {
        throw new Error('persist exploded');
      }),
      failPayout: jest.fn(),
    };

    const summary = await runWithdrawalRecovery({
      repository: repository as any,
      service: service as any,
      paymentAdapter: adapter as any,
      minProcessingAgeMs: 5 * 60 * 1000,
    });

    expect(summary).toMatchObject({ scanned: 1, paid: 0, failed: 0, unknown: 0, errors: 1 });
  });

  it('PSP sem registro (UNKNOWN): contabiliza unknown sem mutação', async () => {
    const repository = {
      listStuckApproved: jest.fn(async () => []),
      listStuckProcessing: jest.fn(async () => [
        { id: randomUUID(), userId: 'user-x', amount: 100, currency: 'BRL' },
      ]),
    };
    const adapter = { getWithdrawalStatus: jest.fn(async () => ({ status: 'UNKNOWN' })) };
    const service = {
      completePayout: jest.fn(),
      failPayout: jest.fn(),
    };

    const summary = await runWithdrawalRecovery({
      repository: repository as any,
      service: service as any,
      paymentAdapter: adapter as any,
      minProcessingAgeMs: 5 * 60 * 1000,
    });

    expect(summary).toMatchObject({ scanned: 1, paid: 0, failed: 0, unknown: 1, errors: 0 });
    expect(service.completePayout).not.toHaveBeenCalled();
    expect(service.failPayout).not.toHaveBeenCalled();
  });

  it('consulta ao PSP falha: outcome error contabilizado como error', async () => {
    const repository = {
      listStuckApproved: jest.fn(async () => []),
      listStuckProcessing: jest.fn(async () => [
        { id: randomUUID(), userId: 'user-x', amount: 100, currency: 'BRL' },
      ]),
    };
    const adapter = {
      getWithdrawalStatus: jest.fn(async () => {
        throw new Error('provider down');
      }),
    };
    const service = { completePayout: jest.fn(), failPayout: jest.fn() };

    const summary = await runWithdrawalRecovery({
      repository: repository as any,
      service: service as any,
      paymentAdapter: adapter as any,
      minProcessingAgeMs: 5 * 60 * 1000,
    });

    expect(summary).toMatchObject({ scanned: 1, paid: 0, failed: 0, unknown: 0, errors: 1 });
  });

  it('usando defaults (minProcessingAgeMs/limit) quando não passados', async () => {
    const repository = {
      listStuckApproved: jest.fn(async () => []),
      listStuckProcessing: jest.fn(async () => [
        { id: randomUUID(), userId: 'user-x', amount: 100, currency: 'BRL' },
      ]),
    };
    const adapter = { getWithdrawalStatus: jest.fn(async () => ({ status: 'FAILED' })) };
    const service = { completePayout: jest.fn(), failPayout: jest.fn() };

    const now = new Date();
    const summary = await runWithdrawalRecovery({
      repository: repository as any,
      service: service as any,
      paymentAdapter: adapter as any,
      now,
    });

    expect(repository.listStuckProcessing).toHaveBeenCalledWith(
      new Date(now.getTime() - 5 * 60 * 1000),
      50,
    );
    expect(summary).toMatchObject({ scanned: 1, paid: 0, failed: 1, unknown: 0, errors: 0 });
  });
});

describe('WithdrawalPayoutWorker — startWithdrawalRecovery', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete process.env.WITHDRAWAL_RECOVERY_INTERVAL_MS;
    delete process.env.WITHDRAWAL_RECOVERY_MIN_AGE_MS;
  });

  it('env inválido cai no fallback de 5min; executa scan imediato', async () => {
    process.env.WITHDRAWAL_RECOVERY_INTERVAL_MS = 'not-a-number';
    process.env.WITHDRAWAL_RECOVERY_MIN_AGE_MS = '0';
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const repository = { listStuckProcessing: jest.fn().mockResolvedValue([]) };

    const handle = startWithdrawalRecovery({ repository: repository as any, service: {} as any });
    await Promise.resolve();

    expect(repository.listStuckProcessing).toHaveBeenCalledTimes(1);
    expect(repository.listStuckProcessing).toHaveBeenCalledWith(expect.any(Date), 50);
    const intervalMs = (setIntervalSpy.mock.calls[0] as [unknown, number])[1];
    expect(intervalMs).toBe(5 * 60 * 1000);
    handle.stop();
  });

  it('env válido define o intervalo e o minProcessingAge', async () => {
    jest.useFakeTimers();
    process.env.WITHDRAWAL_RECOVERY_INTERVAL_MS = '9876';
    process.env.WITHDRAWAL_RECOVERY_MIN_AGE_MS = '4321';
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const repository = { listStuckProcessing: jest.fn().mockResolvedValue([]) };

    const handle = startWithdrawalRecovery({ repository: repository as any, service: {} as any });
    expect(repository.listStuckProcessing).toHaveBeenCalledWith(expect.any(Date), 50);
    expect((setIntervalSpy.mock.calls[0] as [unknown, number])[1]).toBe(9876);
    handle.stop();
  });

  it('não reexecuta scan enquanto um scan está rodando', async () => {
    jest.useFakeTimers();
    process.env.WITHDRAWAL_RECOVERY_INTERVAL_MS = '1000';
    let resolveFirst: (v: never[]) => void = () => {};
    const repository = {
      listStuckProcessing: jest.fn(
        () =>
          new Promise((res) => {
            resolveFirst = res;
          }),
      ),
    };

    const handle = startWithdrawalRecovery({ repository: repository as any, service: {} as any, intervalMs: 1000 });
    await jest.advanceTimersByTimeAsync(1000);
    expect(repository.listStuckProcessing).toHaveBeenCalledTimes(1);

    resolveFirst([]);
    await Promise.resolve();
    handle.stop();
  });

  it('falha do scan é logada e não derruba o scheduler', async () => {
    const repository = { listStuckProcessing: jest.fn().mockRejectedValue(new Error('mongo down')) };

    const handle = startWithdrawalRecovery({
      repository: repository as any,
      service: {} as any,
      intervalMs: 5000,
      minProcessingAgeMs: 60000,
    });
    await Promise.resolve();

    expect(repository.listStuckProcessing).toHaveBeenCalledTimes(1);
    handle.stop();
  });
});

describe('WithdrawalPayoutWorker — startWithdrawalWorker', () => {
  it('registra processador de payout e handler de falha', async () => {
    const service = {
      completePayout: jest.fn().mockResolvedValue(undefined),
      claimForProcessing: jest.fn().mockResolvedValue({ status: 'PROCESSING' }),
    } as any;

    const queue = startWithdrawalWorker(service) as any;
    const WorkerCtor = BullMQ.Worker as unknown as jest.Mock;
    const processor = WorkerCtor.mock.calls[0][1];

    expect(queue.on).toHaveBeenCalledWith('failed', expect.any(Function));

    const p = payload();
    await processor({ data: p, attemptsMade: 0 });
    expect(service.claimForProcessing).toHaveBeenCalledWith(p.requestId);
    expect(service.completePayout).toHaveBeenCalledWith(p.requestId);

    const failedHandler = queue.on.mock.calls[0][1];
    expect(() => failedHandler({ data: p }, 'provider down')).not.toThrow();
  }, 10000);
});