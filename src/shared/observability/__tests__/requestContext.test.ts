import {
  runWithRequestContext,
  getRequestContext,
  updateRequestContext,
} from '../requestContext';

describe('requestContext', () => {
  it('exposes context inside run callback and clears afterwards', () => {
    let insideRequestId: string | undefined;

    runWithRequestContext({ requestId: 'req-1', userId: 'user-1' }, () => {
      insideRequestId = getRequestContext()?.requestId;
      expect(getRequestContext()).toEqual({ requestId: 'req-1', userId: 'user-1' });
    });

    expect(insideRequestId).toBe('req-1');
    expect(getRequestContext()).toBeUndefined();
  });

  it('updates the active context with partial data', () => {
    runWithRequestContext({ requestId: 'req-2' }, () => {
      updateRequestContext({ userId: 'user-2' });
      expect(getRequestContext()).toEqual({ requestId: 'req-2', userId: 'user-2' });
    });
  });

  it('ignores updates when no context is active', () => {
    updateRequestContext({ userId: 'ghost' });
    expect(getRequestContext()).toBeUndefined();
  });

  it('preserves context across asynchronous boundaries', async () => {
    await new Promise<void>((resolve) => {
      runWithRequestContext({ requestId: 'req-async', userId: 'user-async' }, () => {
        setTimeout(() => {
          expect(getRequestContext()).toEqual({ requestId: 'req-async', userId: 'user-async' });
          resolve();
        }, 0);
      });
    });

    expect(getRequestContext()).toBeUndefined();
  });
});
