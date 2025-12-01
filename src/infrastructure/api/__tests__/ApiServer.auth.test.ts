import request from 'supertest';

jest.mock('@clerk/express', () => {
  const middleware = jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next());
  return {
    clerkMiddleware: middleware,
  };
});

describe('ApiServer authentication bootstrap', () => {
  const ORIGINAL_ENV = process.env;

  const getClerkMiddlewareMock = () =>
    jest.requireMock('@clerk/express').clerkMiddleware as jest.Mock;

  const applyEnv = (overrides: Partial<NodeJS.ProcessEnv> = {}) => {
    process.env = {
      ...ORIGINAL_ENV,
      JWT_SECRET: 'test-secret',
      NODE_ENV: overrides.NODE_ENV ?? 'development',
      BACKBET_RUNTIME_ENV: overrides.BACKBET_RUNTIME_ENV ?? overrides.NODE_ENV ?? 'development',
      ...overrides,
    };
  };

  beforeEach(() => {
    jest.resetModules();
    applyEnv();
    getClerkMiddlewareMock().mockClear();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('registers Clerk middleware when a test key exists outside production', async () => {
    applyEnv({ CLERK_SECRET_KEY: 'sk_test_demo' });

    await jest.isolateModulesAsync(async () => {
      const { ApiServer } = await import('../ApiServer');
      const server = new ApiServer(0);
      const app = server.getExpressApp();
      app.get('/ping', (_req, res) => res.sendStatus(204));

      await request(app).get('/ping').expect(204);
    });

    expect(getClerkMiddlewareMock()).toHaveBeenCalled();
  });

  it('falls back to dev bearer bypass when no Clerk secret is provided', async () => {
    applyEnv({ CLERK_SECRET_KEY: '', CLERK_API_KEY: '' });
    await jest.isolateModulesAsync(async () => {
      const { ApiServer } = await import('../ApiServer');
      const server = new ApiServer(0);
      const app = server.getExpressApp();

      app.get('/whoami', (_req, res) => res.sendStatus(204));

      await request(app).get('/whoami').set('Authorization', 'Bearer user_dev_123').expect(204);
    });

    expect(getClerkMiddlewareMock()).not.toHaveBeenCalled();
  });
});
