import { retryWithBackoff } from '../retryPolicy';

describe('retryWithBackoff helper', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries until success and propagates the result', async () => {
    jest.useFakeTimers();
    const fn = jest.fn().mockRejectedValueOnce(new Error('first failure')).mockResolvedValue('ok');
    const onRetry = jest.fn();

    const promise = retryWithBackoff(fn, {
      maxAttempts: 2,
      baseDelayMs: 10,
      factor: 1,
      jitter: 0,
      onRetry,
    });

    await jest.advanceTimersByTimeAsync(10);
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
  });

  it('throws once the max attempts are reached', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('boom'));

    const promise = retryWithBackoff(fn, {
      maxAttempts: 2,
      baseDelayMs: 0,
      factor: 1,
      jitter: 0,
    });

    await expect(promise).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
