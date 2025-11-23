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

const httpRequestLatencySeconds = new Histogram({
  name: 'backbet_http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos (para dashboards Prometheus)',
  labelNames: ['method', 'route', 'status_class'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

const httpErrorCounter = new Counter({
  name: 'backbet_http_errors_total',
  help: 'Número de respostas HTTP com status >= 500',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

const httpActiveRequests = new Gauge({
  name: 'backbet_http_in_flight',
  help: 'Quantidade de requisições HTTP em processamento',
  labelNames: ['method', 'route'],
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

const dependencyHealthGauge = new Gauge({
  name: 'backbet_dependency_health',
  help: 'Estado reportado pelo readiness para cada dependência externa',
  labelNames: ['dependency'],
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

export {
  registry as metricsRegistry,
  httpRequestCounter,
  httpRequestLatency,
  httpRequestLatencySeconds,
  httpErrorCounter,
  httpActiveRequests,
  cacheHits,
  cacheMisses,
  cacheWrites,
  cacheErrors,
  dependencyHealthGauge,
};