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

describe('metrics helpers (modo compatibilidade sem Prometheus)', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('mantém snapshot do cache mesmo sem registries Prometheus', async () => {
    await jest.isolateModulesAsync(async () => {
      const { cacheConfig } = await import('@/shared/config/cacheConfig');
      const { redisClient } = await import('@/infrastructure/cache/RedisClient');
      const cacheMetrics = await import('../cacheMetrics');
      const metricsMock = redisClient.getMetrics as jest.Mock;

      cacheMetrics.updateCacheMetrics();
      expect(metricsMock).toHaveBeenCalled();
      expect(cacheMetrics.getCacheMetricsSnapshot()).toEqual({ hits: 1, misses: 2, writes: 3, errors: 4 });

      cacheConfig.enabled = false;
      cacheMetrics.updateCacheMetrics();
      expect(cacheMetrics.getCacheMetricsSnapshot()).toEqual({ hits: 0, misses: 0, writes: 0, errors: 0 });

      cacheMetrics.stopCacheMetricsPolling();
    });
  });

  it('continua respeitando ciclo de polling e flags', async () => {
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
