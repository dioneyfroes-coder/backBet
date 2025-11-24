import { CircuitBreaker, CircuitOpenError } from '../circuitBreaker';

describe('CircuitBreaker helper', () => {
  it('opens after repeated failures and rejects while open', async () => {
    const breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 2,
      successThreshold: 1,
      resetTimeoutMs: 1000,
    });

    await expect(breaker.execute(() => Promise.reject(new Error('failure-1')))).rejects.toThrow('failure-1');
    await expect(breaker.execute(() => Promise.reject(new Error('failure-2')))).rejects.toThrow('failure-2');

    expect(breaker.getState()).toBe('OPEN');
    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(CircuitOpenError);
  });

  it('transitions from HALF_OPEN back to CLOSED after a successful attempt', async () => {
    jest.useFakeTimers();
    try {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        successThreshold: 1,
        resetTimeoutMs: 100,
      });

      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');

      jest.advanceTimersByTime(100);

      const successPromise = breaker.execute(() => Promise.resolve('recovered'));
      await expect(successPromise).resolves.toBe('recovered');
      expect(breaker.getState()).toBe('CLOSED');
    } finally {
      jest.useRealTimers();
    }
  });
});