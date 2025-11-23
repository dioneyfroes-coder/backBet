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
      const metricsModule = await import('../metrics');
      const metricsMock = redisClient.getMetrics as jest.Mock;
      const initialCalls = metricsMock.mock.calls.length;

      metricsModule.updateCacheMetrics();
      expect(metricsMock).toHaveBeenCalledTimes(initialCalls + 1);

      cacheConfig.enabled = false;
      metricsModule.updateCacheMetrics();
      expect(metricsMock).toHaveBeenCalledTimes(initialCalls + 1);

      metricsModule.stopCacheMetricsPolling();
    });
  });

  it('manages polling lifecycle respecting flags', async () => {
    jest.useFakeTimers();

    await jest.isolateModulesAsync(async () => {
      const { cacheConfig } = await import('@/shared/config/cacheConfig');
      const metrics = await import('../metrics');

      cacheConfig.enabled = true;
      metrics.stopCacheMetricsPolling();
      metrics.startCacheMetricsPolling();
      metrics.startCacheMetricsPolling();
      jest.advanceTimersByTime(0);
      metrics.stopCacheMetricsPolling();
      cacheConfig.enabled = false;
      metrics.stopCacheMetricsPolling();
    });

    jest.useRealTimers();
  });
});
