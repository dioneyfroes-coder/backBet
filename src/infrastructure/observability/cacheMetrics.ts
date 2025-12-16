import { cacheConfig } from '@/shared/config/cacheConfig';
import { redisClient } from '@/infrastructure/cache/RedisClient';

type CacheSnapshot = {
  hits: number;
  misses: number;
  writes: number;
  errors: number;
};

const zeroSnapshot = (): CacheSnapshot => ({ hits: 0, misses: 0, writes: 0, errors: 0 });

let cacheSnapshot: CacheSnapshot = zeroSnapshot();

export const updateCacheMetrics = (): void => {
  if (!cacheConfig.enabled) {
    cacheSnapshot = zeroSnapshot();
    return;
  }
  const metrics = redisClient.getMetrics();
  cacheSnapshot = {
    hits: metrics.hits,
    misses: metrics.misses,
    writes: metrics.writes,
    errors: metrics.errors,
  };
};

export const getCacheMetricsSnapshot = (): CacheSnapshot => ({ ...cacheSnapshot });

let cacheMetricsInterval: NodeJS.Timeout | null = null;

export const startCacheMetricsPolling = (): void => {
  if (!cacheConfig.enabled || cacheMetricsInterval) {
    return;
  }
  updateCacheMetrics();
  cacheMetricsInterval = setInterval(updateCacheMetrics, 3000);
};

export const stopCacheMetricsPolling = (): void => {
  if (cacheMetricsInterval) {
    clearInterval(cacheMetricsInterval);
    cacheMetricsInterval = null;
  }
  if (!cacheConfig.enabled) {
    updateCacheMetrics();
  }
};

if (cacheConfig.enabled) {
  startCacheMetricsPolling();
} else {
  updateCacheMetrics();
}
