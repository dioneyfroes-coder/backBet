import { CircuitBreaker } from './circuitBreaker';
import {
  recordCircuitBreakerOpen,
  recordCircuitBreakerState,
} from '@/infrastructure/observability/resilienceMetrics';

const createBreaker = (name: string) =>
  new CircuitBreaker({
    name,
    failureThreshold: 4,
    successThreshold: 2,
    resetTimeoutMs: 15000,
    onStateChange: ({ name: dependencyName, state }) => {
      recordCircuitBreakerState(dependencyName, state);
      console.warn(`Circuit breaker ${dependencyName} moved to ${state}`);
      if (state === 'OPEN') {
        recordCircuitBreakerOpen(dependencyName);
      }
    },
  });

export const redisCircuitBreaker = createBreaker('redis');
export const mongoCircuitBreaker = createBreaker('mongo');

recordCircuitBreakerState('redis', 'CLOSED');
recordCircuitBreakerState('mongo', 'CLOSED');
