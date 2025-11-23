import Redis from 'ioredis';
import { RedisClient } from '../RedisClient';
import { cacheConfig } from '@/shared/config/cacheConfig';

jest.mock('ioredis');
jest.mock('@/shared/config/cacheConfig', () => ({
  cacheConfig: {
    enabled: true,
    redisUrl: 'redis://test',
    defaultTTLSeconds: 60,
  },
}));

describe('RedisClient', () => {
  const redisMock = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    ping: jest.fn(),
    on: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cacheConfig.enabled = true;
    (Redis as unknown as jest.Mock).mockReturnValue(redisMock);
    redisMock.get.mockReset();
    redisMock.set.mockReset();
    redisMock.del.mockReset();
    redisMock.ping.mockReset();
    redisMock.on.mockReset();
  });

  const createClient = () => new RedisClient();

  it('reads and writes values, tracking metrics', async () => {
    const client = createClient();
    redisMock.get.mockResolvedValueOnce(null);
    redisMock.get.mockResolvedValueOnce(JSON.stringify({ foo: 'bar' }));

    await expect(client.get('missing')).resolves.toBeNull();
    await expect(client.get('hit')).resolves.toEqual({ foo: 'bar' });

    await client.set('foo', { bar: 1 }, 30);
    await client.del('foo');

    expect(redisMock.set).toHaveBeenCalledWith('foo', JSON.stringify({ bar: 1 }), 'EX', 30);
    expect(client.getMetrics()).toMatchObject({ hits: 1, misses: 1, writes: 1 });
  });

  it('wraps cached helper to re-use values', async () => {
    const client = createClient();
    redisMock.get.mockResolvedValueOnce(null);

    const producer = jest.fn().mockResolvedValue({ token: 'abc' });
    const value = await client.cached('token', 10, producer);

    expect(value).toEqual({ token: 'abc' });
    expect(producer).toHaveBeenCalled();
  });

  it('records errors on read/write/delete failures and handles ping', async () => {
    const client = createClient();
    const failure = new Error('fail');
    redisMock.get.mockRejectedValueOnce(failure);
    redisMock.set.mockRejectedValueOnce(failure);
    redisMock.del.mockRejectedValueOnce(failure);
    redisMock.ping.mockRejectedValueOnce(failure);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await client.get('boom');
    await client.set('boom', {});
    await client.del('boom');
    await expect(client.ping()).rejects.toThrow('fail');

    expect(client.getMetrics().errors).toBeGreaterThanOrEqual(4);
    warnSpy.mockRestore();
  });

  it('does nothing when cache is disabled', async () => {
    cacheConfig.enabled = false;
    const client = createClient();

    await expect(client.get('key')).resolves.toBeNull();
    await client.set('key', 'value');
    await client.del('key');
    await expect(client.ping()).resolves.toBeNull();

    expect(Redis).not.toHaveBeenCalled();
  });

  it('attaches error listener and counts emitted errors', async () => {
    const client = createClient();
    redisMock.get.mockResolvedValueOnce(null);
    await client.get('trigger');
    const handler = redisMock.on.mock.calls.find(([event]) => event === 'error')?.[1];
    expect(typeof handler).toBe('function');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    handler?.(new Error('redis-err'));

    expect(client.getMetrics().errors).toBe(1);
    errorSpy.mockRestore();
  });
});
