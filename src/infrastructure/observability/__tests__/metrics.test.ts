jest.mock('@/shared/config/cacheConfig', () => ({
  cacheConfig: {
    enabled: true,
    userBalanceTTL: 15,
    walletHistoryTTL: 30,
    defaultTTLSeconds: 60,
    oddsTTL: 10,
  },
}));

jest.mock('@/infrastructure/cache/RedisClient', () => ({
  redisClient: {
    getMetrics: jest.fn().mockReturnValue({ hits: 1, misses: 2, writes: 3, errors: 4 }),
  },
}));

describe('metrics helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('updates cache metrics when cache is enabled or disabled', async () => {
    await jest.isolateModulesAsync(async () => {
      const { cacheConfig } = await import('@/shared/config/cacheConfig');
      const { redisClient } = await import('@/infrastructure/cache/RedisClient');
      const cacheMetrics = await import('../cacheMetrics');
      const metricsMock = redisClient.getMetrics as jest.Mock;
      const initialCalls = metricsMock.mock.calls.length;

      cacheMetrics.updateCacheMetrics();
      expect(metricsMock).toHaveBeenCalledTimes(initialCalls + 1);

      cacheConfig.enabled = false;
      cacheMetrics.updateCacheMetrics();
      expect(metricsMock).toHaveBeenCalledTimes(initialCalls + 1);

      cacheMetrics.stopCacheMetricsPolling();
    });
  });

  it('manages polling lifecycle respecting flags', async () => {
    jest.useFakeTimers();

    await jest.isolateModulesAsync(async () => {
      const { cacheConfig } = await import('@/shared/config/cacheConfig');
      const cacheMetrics = await import('../cacheMetrics');

      cacheConfig.enabled = true;
      cacheMetrics.stopCacheMetricsPolling();
      cacheMetrics.startCacheMetricsPolling();
      cacheMetrics.startCacheMetricsPolling();
      jest.advanceTimersByTime(0);
      cacheMetrics.stopCacheMetricsPolling();
      cacheConfig.enabled = false;
      cacheMetrics.stopCacheMetricsPolling();
    });

    jest.useRealTimers();
  });
});
