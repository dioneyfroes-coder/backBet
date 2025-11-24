const mockMetrics = {
  recordCircuitBreakerState: jest.fn(),
  recordCircuitBreakerOpen: jest.fn(),
};

jest.mock('@/infrastructure/observability/resilienceMetrics', () => mockMetrics);

describe('dependency circuit breakers', () => {
  beforeEach(() => {
    jest.resetModules();
    mockMetrics.recordCircuitBreakerState.mockClear();
    mockMetrics.recordCircuitBreakerOpen.mockClear();
  });

  it('records the initial state for both dependencies', async () => {
    await import('../dependencyCircuitBreakers');
    expect(mockMetrics.recordCircuitBreakerState).toHaveBeenCalledWith('redis', 'CLOSED');
    expect(mockMetrics.recordCircuitBreakerState).toHaveBeenCalledWith('mongo', 'CLOSED');
  });

  it('records opens when redis breaker trips', async () => {
    const { redisCircuitBreaker } = await import('../dependencyCircuitBreakers');
    const failing = () => Promise.reject(new Error('boom'));

    for (let i = 0; i < 4; i += 1) {
      await expect(redisCircuitBreaker.execute(failing)).rejects.toThrow('boom');
    }

    expect(mockMetrics.recordCircuitBreakerOpen).toHaveBeenCalledWith('redis');
  });
});