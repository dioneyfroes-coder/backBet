import { CircuitBreakerState } from '@/shared/resilience/circuitBreaker';
import { Counter, Gauge } from 'prom-client';
import { metricsRegistry } from './metrics';

const STATE_VALUES: Record<CircuitBreakerState, number> = {
  CLOSED: 0,
  HALF_OPEN: 1,
  OPEN: 2,
};

const retryAttemptsCounter = new Counter({
  name: 'backbet_retry_attempts_total',
  help: 'Tentativas de retry executadas contra dependências externas',
  labelNames: ['dependency'],
  registers: [metricsRegistry],
});

const retryFailuresCounter = new Counter({
  name: 'backbet_retry_failures_total',
  help: 'Falhas após todas as tentativas de retry contra dependências externas',
  labelNames: ['dependency'],
  registers: [metricsRegistry],
});

const circuitBreakerStateGauge = new Gauge({
  name: 'backbet_circuit_breaker_state',
  help: 'Estado atual do circuit breaker (0=closed, 1=half-open, 2=open)',
  labelNames: ['dependency'],
  registers: [metricsRegistry],
});

const circuitBreakerOpenCounter = new Counter({
  name: 'backbet_circuit_breaker_open_total',
  help: 'Quantidade de vezes que o circuit breaker abriu para cada dependência',
  labelNames: ['dependency'],
  registers: [metricsRegistry],
});

export const recordRetryAttempt = (dependency: string): void => {
  retryAttemptsCounter.labels(dependency).inc();
};

export const recordRetryFailure = (dependency: string): void => {
  retryFailuresCounter.labels(dependency).inc();
};

export const recordCircuitBreakerState = (dependency: string, state: CircuitBreakerState): void => {
  circuitBreakerStateGauge.labels(dependency).set(STATE_VALUES[state]);
};

export const recordCircuitBreakerOpen = (dependency: string): void => {
  circuitBreakerOpenCounter.labels(dependency).inc();
};
