import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('ApiServer authentication bootstrap', () => {
  jest.setTimeout(30000);
  const ORIGINAL_ENV = process.env;

  const applyEnv = (overrides: Partial<NodeJS.ProcessEnv> = {}) => {
    process.env = {
      ...ORIGINAL_ENV,
      JWT_SECRET: 'test-secret',
      JWT_ISSUER: 'backbet',
      NODE_ENV: overrides.NODE_ENV ?? 'development',
      BACKBET_RUNTIME_ENV: overrides.BACKBET_RUNTIME_ENV ?? overrides.NODE_ENV ?? 'development',
      ALLOW_DEV_BEARER_BYPASS: overrides.ALLOW_DEV_BEARER_BYPASS ?? 'true',
      ...overrides,
    };
  };

  const mountWhoAmIRoute = (app: import('express').Express) => {
    app.get('/whoami', (req, res) => {
      const authContext = (req as any).authContext;
      if (!authContext?.userId) {
        return res.sendStatus(401);
      }
      return res.status(200).json({ userId: authContext.userId });
    });
  };

  beforeEach(() => {
    jest.resetModules();
    applyEnv();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('allows dev bearer bypass when enabled outside production', async () => {
    applyEnv({ ALLOW_DEV_BEARER_BYPASS: 'true' });

    await jest.isolateModulesAsync(async () => {
      const { ApiServer } = await import('../ApiServer');
      const server = new ApiServer(0);
      const app = server.getExpressApp();
      mountWhoAmIRoute(app);

      await request(app)
        .get('/whoami')
        .set('Authorization', 'Bearer dev-user-123')
        .expect(200, { userId: 'dev-user-123' });
    });
  });

  it('rejects non-JWT bearer tokens when bypass is disabled', async () => {
    applyEnv({ ALLOW_DEV_BEARER_BYPASS: 'false' });

    await jest.isolateModulesAsync(async () => {
      const { ApiServer } = await import('../ApiServer');
      const server = new ApiServer(0);
      const app = server.getExpressApp();
      mountWhoAmIRoute(app);

      await request(app).get('/whoami').set('Authorization', 'Bearer plain-user').expect(401);
    });
  });

  it('accepts valid JWT bearer tokens when bypass is disabled', async () => {
    applyEnv({ ALLOW_DEV_BEARER_BYPASS: 'false' });

    await jest.isolateModulesAsync(async () => {
      const { ApiServer } = await import('../ApiServer');
      const server = new ApiServer(0);
      const app = server.getExpressApp();
      mountWhoAmIRoute(app);

      const token = jwt.sign(
        { userId: 'jwt-user', sessionId: 'session-1', kind: 'access' },
        'test-secret',
        { issuer: 'backbet', expiresIn: '15m' },
      );

      await request(app)
        .get('/whoami')
        .set('Authorization', `Bearer ${token}`)
        .expect(200, { userId: 'jwt-user' });
    });
  });
});
