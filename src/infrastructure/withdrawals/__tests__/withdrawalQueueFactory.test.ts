// Testa a escolha de backend de fila de retiradas (BullMQ vs InMemory) sem Redis real.

process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

const mockPing = jest.fn();
const mockQuit = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    on: jest.fn(),
    ping: mockPing,
    quit: mockQuit,
  })),
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn(function (this: any, name: string, opts: any) {
    this.name = name;
    this.opts = opts;
    this.add = jest.fn();
    this.getJobCounts = jest.fn();
  }),
  Worker: jest.fn(),
}));

jest.mock('@/shared/config/connections', () => ({
  __esModule: true,
  getRedisUrl: jest.fn(() => 'redis://127.0.0.1:6379'),
  getMongoUri: jest.fn(() => 'mongodb://localhost'),
  getMongoDbName: jest.fn(() => 'backbet'),
  dbNameFromUri: jest.fn(() => 'backbet'),
}));

jest.mock('@/infrastructure/queues/bullMqConnection', () => ({
  __esModule: true,
  createBullMqConnection: jest.fn(() => ({ host: 'localhost', port: 6379 })),
}));

jest.mock('@/shared/logging/structuredLogger', () => ({
  writeStructuredLog: jest.fn(),
}));

import { createWithdrawalQueue } from '../withdrawalQueueFactory';
import createWithdrawalQueueDefault from '../withdrawalQueueFactory';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';

const ctorName = (value: unknown): string =>
  value === null || value === undefined
    ? ''
    : ((value as { constructor?: { name?: string } }).constructor?.name ?? '');

describe('createWithdrawalQueue', () => {
  beforeEach(() => {
    mockPing.mockReset();
    mockQuit.mockReset().mockResolvedValue('OK');
    (writeStructuredLog as jest.Mock).mockClear();
    process.env.NODE_ENV = 'test';
    process.env.BACKBET_RUNTIME_ENV = 'test';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  });

  it('em runtime de teste, sempre usa InMemory sem tocar no Redis', async () => {
    const queue = await createWithdrawalQueue();

    expect(ctorName(queue)).toBe('InMemoryWithdrawalQueue');
    expect(mockPing).not.toHaveBeenCalled();
  });

  it('fora de teste: com Redis respondendo ao ping, usa o backend BullMQ', async () => {
    process.env.BACKBET_RUNTIME_ENV = 'production';
    mockPing.mockResolvedValue('PONG');

    const queue = await createWithdrawalQueue();

    expect(ctorName(queue)).toBe('BullWithdrawalQueue');
    expect(mockPing).toHaveBeenCalledTimes(1);
    expect(mockQuit).toHaveBeenCalledTimes(1);
    expect(writeStructuredLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'withdrawal_queue_backend', backend: 'bullmq' }),
    );
  });

  it('fora de teste: com Redis indisponível, cai no fallback InMemory e loga', async () => {
    process.env.BACKBET_RUNTIME_ENV = 'production';
    mockPing.mockRejectedValue(new Error('ECONNREFUSED'));

    const queue = await createWithdrawalQueue();

    expect(ctorName(queue)).toBe('InMemoryWithdrawalQueue');
    expect(writeStructuredLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'withdrawal_queue_fallback', backend: 'inmemory' }),
    );
  });

  it('detecta runtime de teste pelo NODE_ENV quando BACKBET_RUNTIME_ENV está ausente', async () => {
    delete process.env.BACKBET_RUNTIME_ENV;
    process.env.NODE_ENV = 'test';

    const queue = await createWithdrawalQueue();

    expect(ctorName(queue)).toBe('InMemoryWithdrawalQueue');
    expect(mockPing).not.toHaveBeenCalled();
  });

  it('fora de teste com ambos os envs indefinidos: usa o fallback InMemory', async () => {
    delete process.env.BACKBET_RUNTIME_ENV;
    process.env.NODE_ENV = '';
    mockPing.mockRejectedValue(new Error('redis unreachable'));

    const queue = await createWithdrawalQueue();

    expect(ctorName(queue)).toBe('InMemoryWithdrawalQueue');
    expect(mockPing).toHaveBeenCalledTimes(1);
  });

  it('fallback ignora um erro no quit do cliente Redis', async () => {
    process.env.BACKBET_RUNTIME_ENV = 'production';
    mockPing.mockRejectedValue(new Error('ECONNREFUSED'));
    mockQuit.mockRejectedValue(new Error('already closed'));

    const queue = await createWithdrawalQueue();

    expect(ctorName(queue)).toBe('InMemoryWithdrawalQueue');
    expect(mockQuit).toHaveBeenCalledTimes(1);
  });

  it('o export default redireciona para o mesmo criador (uso legado)', async () => {
    const queue = await createWithdrawalQueueDefault();
    expect(ctorName(queue)).toBe('InMemoryWithdrawalQueue');
  });
});