jest.mock('dotenv', () => ({
  config: jest.fn(() => ({ parsed: {} })),
}));

describe('configuration parsing helpers', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('loads env defaults in test mode when secrets are missing', async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'test';

    await jest.isolateModulesAsync(async () => {
      const { env } = await import('../env');
      expect(env.JWT_SECRET).toBe('test-secret');
      expect(env.MONGODB_URI).toBeDefined();
    });
  });

  it('throws when required production variables are missing', async () => {
    process.env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;

    await expect(
      jest.isolateModulesAsync(async () => {
        await import('../env');
      }),
    ).rejects.toThrow('Missing required environment variables');
  });

  it('parses appConfig values according to environment variables', async () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'secret';
    process.env.PORT = '8080';
    process.env.CORS_ALLOWED_ORIGINS = 'http://site-a.com, http://site-b.com';
    process.env.ALLOW_DEV_BEARER_BYPASS = 'true';
    process.env.RATE_LIMIT_MAX = '1000';
    process.env.RATE_LIMIT_ENABLED = 'true';

    await jest.isolateModulesAsync(async () => {
      const { appConfig } = await import('../appConfig');
      expect(appConfig.server.port).toBe(8080);
      expect(appConfig.cors.allowedOrigins).toEqual([
        'http://site-a.com',
        'http://site-b.com',
      ]);
      expect(appConfig.security.allowDevBearerBypass).toBe(true);
      expect(appConfig.rateLimit.max).toBe(1000);
    });
  });

  it('derives cache configuration defaults', async () => {
    process.env.JWT_SECRET = 'secret';
    process.env.NODE_ENV = 'development';
    process.env.CACHE_TTL_SECONDS = '120';
    process.env.CACHE_ENABLED = 'true';

    await jest.isolateModulesAsync(async () => {
      const { cacheConfig } = await import('../cacheConfig');
      expect(cacheConfig.defaultTTLSeconds).toBe(120);
      expect(cacheConfig.enabled).toBe(true);
    });
  });
});
