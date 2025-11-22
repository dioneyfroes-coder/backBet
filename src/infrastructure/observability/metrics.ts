import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import { cacheConfig } from '@/shared/config/cacheConfig';
import { redisClient } from '@/infrastructure/cache/RedisClient';

const registry = new Registry();
collectDefaultMetrics({ prefix: 'backbet_', register: registry });

const httpRequestCounter = new Counter({
  name: 'backbet_http_requests_total',
  help: 'Contador de requisições HTTP recebidas',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

const httpRequestLatency = new Histogram({
  name: 'backbet_http_request_duration_ms',
  help: 'Duração das requisições HTTP em milissegundos',
  labelNames: ['method', 'route', 'status'],
  buckets: [50, 100, 250, 500, 1000, 2000, 5000],
  registers: [registry],
});

const cacheHits = new Gauge({
  name: 'backbet_cache_hits_total',
  help: 'Número de leituras atendidas pelo Redis',
  registers: [registry],
});

const cacheMisses = new Gauge({
  name: 'backbet_cache_misses_total',
  help: 'Número de leituras que precisaram ser recarregadas',
  registers: [registry],
});

const cacheWrites = new Gauge({
  name: 'backbet_cache_writes_total',
  help: 'Número de escritas realizadas no Redis',
  registers: [registry],
});

const cacheErrors = new Gauge({
  name: 'backbet_cache_errors_total',
  help: 'Número de erros observados na camada de cache',
  registers: [registry],
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

setInterval(updateCacheMetrics, 3000);

export {
  registry as metricsRegistry,
  httpRequestCounter,
  httpRequestLatency,
};