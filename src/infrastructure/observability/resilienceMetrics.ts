import { CircuitBreakerState } from '@/shared/resilience/circuitBreaker';
import { Counter, Gauge } from 'prom-client';
import { metricsRegistry } from './metrics';

/**
 * Resiliência (retries e circuit breaker) — métricas prometheus.
 *
 * Além do snapshot em memória usado pela /health, cada evento de retry /
 * falha / estado do circuit breaker é publicado no /metrics do Prometheus,
 * permitindo alertas como ""Burst de falhas de retry do Redis/Mongo"".
 */

type CounterRecord = Record<string, number>;

const STATE_VALUES: Record<CircuitBreakerState, number> = {
  CLOSED: 0,
  HALF_OPEN: 1,
  OPEN: 2,
};

const retryAttempts: CounterRecord = {};
const retryFailures: CounterRecord = {};
const circuitBreakerState: CounterRecord = {};
const circuitBreakerOpens: CounterRecord = {};

const retryAttemptsTotal = new Counter({
  name: 'backbet_resilience_retries_total',
  help: 'Total de tentativas de retry por dependência',
  labelNames: ['dependency'],
  registers: [metricsRegistry],
});

const retryFailuresTotal = new Counter({
  name: 'backbet_resilience_retry_failures_total',
  help: 'Total de falhas de retry por dependência',
  labelNames: ['dependency'],
  registers: [metricsRegistry],
});

const circuitBreakerStateGauge = new Gauge({
  name: 'backbet_circuit_breaker_state',
  help: 'Estado do circuit breaker por dependência (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
  labelNames: ['dependency'],
  registers: [metricsRegistry],
});

const circuitBreakerOpensTotal = new Counter({
  name: 'backbet_circuit_breaker_opens_total',
  help: 'Total de aberturas do circuit breaker por dependência',
  labelNames: ['dependency'],
  registers: [metricsRegistry],
});

const increment = (target: CounterRecord, key: string): void => {
  target[key] = (target[key] ?? 0) + 1;
};

const safeInc = (operation: () => void): void => {
  try {
    operation();
  } catch {
    // métrica nunca derruba a aplicação
  }
};

export const recordRetryAttempt = (dependency: string): void => {
  increment(retryAttempts, dependency);
  safeInc(() => retryAttemptsTotal.labels(dependency).inc());
};

export const recordRetryFailure = (dependency: string): void => {
  increment(retryFailures, dependency);
  safeInc(() => retryFailuresTotal.labels(dependency).inc());
};

export const recordCircuitBreakerState = (dependency: string, state: CircuitBreakerState): void => {
  circuitBreakerState[dependency] = STATE_VALUES[state];
  safeInc(() => circuitBreakerStateGauge.labels(dependency).set(STATE_VALUES[state]));
};

export const recordCircuitBreakerOpen = (dependency: string): void => {
  increment(circuitBreakerOpens, dependency);
  safeInc(() => circuitBreakerOpensTotal.labels(dependency).inc());
};

export const getResilienceMetricsSnapshot = () => ({
  retryAttempts: { ...retryAttempts },
  retryFailures: { ...retryFailures },
  circuitBreakerState: { ...circuitBreakerState },
  circuitBreakerOpens: { ...circuitBreakerOpens },
});