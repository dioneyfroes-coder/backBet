import { Gauge } from 'prom-client';
import { metricsRegistry } from './metrics';
import { getCacheMetricsSnapshot } from './cacheMetrics';

export { metricsRegistry };

/**
 * Métricas de infraestrutura do Redis (Fase 10 — Observabilidade).
 *
 * A /readiness já mede a latência de ping do Redis a cada checagem; este módulo
 * publica essa latência e o snapshot de operações de cache no /metrics do
 * Prometheus, fechando o ciclo falha → métrica → alerta.
 */

const redisPingDurationMs = new Gauge({
  name: 'backbet_redis_ping_duration_ms',
  help: 'Latência do último ping ao Redis em milissegundos',
  registers: [metricsRegistry],
});

const redisPingFailures = new Gauge({
  name: 'backbet_redis_ping_failures_total',
  help: 'Número acumulado de falhas de ping ao Redis desde o último export',
  registers: [metricsRegistry],
});

const cacheHitsGauge = new Gauge({
  name: 'backbet_cache_hits',
  help: 'Total de acertos de cache Redis desde o início do processo',
  registers: [metricsRegistry],
});

const cacheMissesGauge = new Gauge({
  name: 'backbet_cache_misses',
  help: 'Total de cache misses no Redis desde o início do processo',
  registers: [metricsRegistry],
});

const cacheWritesGauge = new Gauge({
  name: 'backbet_cache_writes',
  help: 'Total de escritas de cache Redis desde o início do processo',
  registers: [metricsRegistry],
});

const cacheErrorsGauge = new Gauge({
  name: 'backbet_cache_errors',
  help: 'Total de erros de cache Redis desde o início do processo',
  registers: [metricsRegistry],
});

export function recordRedisPing(latencyMs: number): void {
  redisPingDurationMs.set(Math.max(0, latencyMs));
}

export function recordRedisPingFailure(): void {
  try {
    redisPingFailures.inc();
  } catch {
    // métrica nunca derruba a aplicação
  }
}

export function exportCacheMetrics(): void {
  try {
    const snapshot = getCacheMetricsSnapshot();
    cacheHitsGauge.set(snapshot.hits);
    cacheMissesGauge.set(snapshot.misses);
    cacheWritesGauge.set(snapshot.writes);
    cacheErrorsGauge.set(snapshot.errors);
  } catch {
    // métrica nunca derruba a aplicação
  }
}