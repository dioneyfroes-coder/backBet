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

  it('sets nextAttempt, reports open state, and closes once the timeout expires', async () => {
    const breaker = new CircuitBreaker({
      name: 'time-aware',
      failureThreshold: 1,
      successThreshold: 1,
      resetTimeoutMs: 100,
    });

    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(breaker.isOpen()).toBe(true);
    const nextAttempt = breaker.getNextAttempt();
    expect(typeof nextAttempt).toBe('number');

    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(CircuitOpenError);

    const future = (nextAttempt ?? Date.now()) + 200;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(future);
    await expect(breaker.execute(() => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.getNextAttempt()).toBeNull();
    nowSpy.mockRestore();
  });
});

describe('CircuitOpenError', () => {
  it('shows the dependency and next attempt when provided', () => {
    const timestamp = 1672531200000;
    const error = new CircuitOpenError('redis', timestamp);
    expect(error.message).toContain('redis circuit open until');
    expect(error.message).toContain(new Date(timestamp).toISOString());
  });

  it('falls back to a short message when next attempt is null', () => {
    const error = new CircuitOpenError('redis', null);
    expect(error.message).toBe('redis circuit is open');
  });
});