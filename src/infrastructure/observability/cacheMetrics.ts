import { cacheConfig } from '@/shared/config/cacheConfig';
import { redisClient } from '@/infrastructure/cache/RedisClient';
import { Gauge } from 'prom-client';
import { metricsRegistry } from './metrics';

const cacheHits = new Gauge({
  name: 'backbet_cache_hits_total',
  help: 'Número de leituras atendidas pelo Redis',
  registers: [metricsRegistry],
});

const cacheMisses = new Gauge({
  name: 'backbet_cache_misses_total',
  help: 'Número de leituras que precisaram ser recarregadas',
  registers: [metricsRegistry],
});

const cacheWrites = new Gauge({
  name: 'backbet_cache_writes_total',
  help: 'Número de escritas realizadas no Redis',
  registers: [metricsRegistry],
});

const cacheErrors = new Gauge({
  name: 'backbet_cache_errors_total',
  help: 'Número de erros observados na camada de cache',
  registers: [metricsRegistry],
});

export const updateCacheMetrics = (): void => {
  if (!cacheConfig.enabled) {
    cacheHits.set(0);
    cacheMisses.set(0);
    cacheWrites.set(0);
    cacheErrors.set(0);
    return;
  }

  const metrics = redisClient.getMetrics();
  cacheHits.set(metrics.hits);
  cacheMisses.set(metrics.misses);
  cacheWrites.set(metrics.writes);
  cacheErrors.set(metrics.errors);
};

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
