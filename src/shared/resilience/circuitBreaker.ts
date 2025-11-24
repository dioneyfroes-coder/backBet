export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  successThreshold?: number;
  resetTimeoutMs?: number;
  onStateChange?: (info: { name: string; state: CircuitBreakerState }) => void;
}

export class CircuitOpenError extends Error {
  constructor(public readonly dependency: string, public readonly nextAttempt: number | null) {
    super(
      nextAttempt
        ? `${dependency} circuit open until ${new Date(nextAttempt).toISOString()}`
        : `${dependency} circuit is open`,
    );
    this.name = 'CircuitOpenError';
  }
}

const DEFAULT_OPTIONS = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 10000,
};

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt: number | null = null;

  constructor(private readonly options: CircuitBreakerOptions) {}

  public getState(): CircuitBreakerState {
    return this.state;
  }

  public isOpen(): boolean {
    return this.state === 'OPEN';
  }

  public getNextAttempt(): number | null {
    return this.nextAttempt;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (this.state === 'OPEN') {
      if (this.nextAttempt && now >= this.nextAttempt) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw new CircuitOpenError(this.options.name, this.nextAttempt);
      }
    }

    try {
      const result = await fn();
      this.handleSuccess();
      return result;
    } catch (error) {
      this.handleFailure(error);
      throw error;
    }
  }

  private handleSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount += 1;
      if (this.successCount >= this.getSuccessThreshold()) {
        this.transitionTo('CLOSED');
      }
    }
  }

  private handleFailure(error: unknown): void {
    this.failureCount += 1;
    if (this.state === 'HALF_OPEN' || this.state === 'CLOSED') {
      if (this.failureCount >= this.getFailureThreshold()) {
        this.transitionTo('OPEN');
      }
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    if (this.state === newState) {
      return;
    }

    this.state = newState;
    if (newState === 'OPEN') {
      this.nextAttempt = Date.now() + this.getResetTimeout();
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === 'HALF_OPEN') {
      this.successCount = 0;
      this.nextAttempt = null;
    } else {
      this.failureCount = 0;
      this.successCount = 0;
      this.nextAttempt = null;
    }

    this.options.onStateChange?.({ name: this.options.name, state: this.state });
  }

  private getFailureThreshold(): number {
    return this.options.failureThreshold ?? DEFAULT_OPTIONS.failureThreshold;
  }

  private getSuccessThreshold(): number {
    return this.options.successThreshold ?? DEFAULT_OPTIONS.successThreshold;
  }

  private getResetTimeout(): number {
    return this.options.resetTimeoutMs ?? DEFAULT_OPTIONS.resetTimeoutMs;
  }
}
