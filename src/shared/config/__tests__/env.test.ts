import { config as dotenvConfig } from 'dotenv';

jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

describe('env config loader', () => {
  const ORIGINAL_ENV = process.env;
  let warnSpy: jest.SpyInstance;
  let mockDotenv: jest.MockedFunction<typeof dotenvConfig>;

  const loadModule = () => {
    let moduleExports: typeof import('../env');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      moduleExports = require('../env');
    });
    return moduleExports!;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV } as any;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenvModule = require('dotenv');
    mockDotenv = dotenvModule.config as jest.MockedFunction<typeof dotenvConfig>;
    mockDotenv.mockReturnValue({} as any);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    process.env = ORIGINAL_ENV;
  });

  it('warns when dotenv fails with unexpected errors', () => {
    mockDotenv.mockReturnValue({ error: { message: 'boom' } } as any);
    process.env = { ...process.env, JWT_SECRET: 'secret', NODE_ENV: 'development' } as any;

    loadModule();

    expect(warnSpy).toHaveBeenCalledWith('Falha ao carregar .env:', 'boom');
  });

  it('skips warning when dotenv only reports missing file', () => {
    mockDotenv.mockReturnValue({ error: { code: 'ENOENT', message: 'missing' } } as any);
    process.env = { ...process.env, JWT_SECRET: 'secret', NODE_ENV: 'development' } as any;

    loadModule();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('assigns safe defaults while running in test mode', () => {
    process.env = { NODE_ENV: 'test' } as any;

    const { env } = loadModule();

    expect(env.JWT_SECRET).toBe('test-secret');
    expect(env.CLERK_SECRET_KEY).toBe('sk_test_dummy');
    expect(env.MONGODB_URI).toBe('mongodb://localhost:27017/backbet-test');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
  });

  it('throws when required environment variables are missing', () => {
    process.env = { NODE_ENV: 'development' } as any;

    expect(() => loadModule()).toThrow('Missing required environment variables: JWT_SECRET');
  });

  it('validates production-only secrets and enforces live keys', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'live-secret',
      CLERK_SECRET_KEY: 'sk_test_dummy',
      CLERK_PUBLISHABLE_KEY: 'pk_live_dummy',
      MONGODB_URI: 'mongodb://prod',
      REDIS_URL: 'redis://prod',
    } as any;

    expect(() => loadModule()).toThrow('CLERK_SECRET_KEY deve usar uma chave live em produção');

    process.env.CLERK_SECRET_KEY = 'sk_live_dummy';
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_dummy';

    expect(() => loadModule()).toThrow(
      'CLERK_PUBLISHABLE_KEY deve usar uma chave live em produção',
    );

    process.env.CLERK_PUBLISHABLE_KEY = 'pk_live_dummy';

    expect(() => loadModule()).not.toThrow();
  });
});
