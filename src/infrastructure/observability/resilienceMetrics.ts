import { CircuitBreakerState } from '@/shared/resilience/circuitBreaker';

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

const increment = (target: CounterRecord, key: string): void => {
  target[key] = (target[key] ?? 0) + 1;
};

export const recordRetryAttempt = (dependency: string): void => {
  increment(retryAttempts, dependency);
};

export const recordRetryFailure = (dependency: string): void => {
  increment(retryFailures, dependency);
};

export const recordCircuitBreakerState = (dependency: string, state: CircuitBreakerState): void => {
  circuitBreakerState[dependency] = STATE_VALUES[state];
};

export const recordCircuitBreakerOpen = (dependency: string): void => {
  increment(circuitBreakerOpens, dependency);
};

export const getResilienceMetricsSnapshot = () => ({
  retryAttempts: { ...retryAttempts },
  retryFailures: { ...retryFailures },
  circuitBreakerState: { ...circuitBreakerState },
  circuitBreakerOpens: { ...circuitBreakerOpens },
});
