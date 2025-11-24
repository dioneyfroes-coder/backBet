export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  factor?: number;
  jitter?: number;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 150,
  factor: 2,
  jitter: 0.25,
  onRetry: () => {},
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const merged: Required<RetryOptions> = { ...DEFAULT_OPTIONS, ...options };
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      if (attempt >= merged.maxAttempts) {
        throw error;
      }

      const delayBase = merged.baseDelayMs * Math.pow(merged.factor, attempt - 1);
      const jitterOffset = (Math.random() * merged.jitter * delayBase * 2) - merged.jitter * delayBase;
      const delayMs = Math.max(0, delayBase + jitterOffset);

      merged.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
}
