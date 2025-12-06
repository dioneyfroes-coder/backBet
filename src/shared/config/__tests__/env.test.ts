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
    expect(env.MONGODB_URI).toBe('mongodb://localhost:27017/backbet-test');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.ALLOW_DEV_BEARER_BYPASS).toBe('false');
    expect(env.WALLET_MIN_DEPOSIT).toBe('1');
    expect(env.WALLET_MIN_WITHDRAW).toBe('100');
    expect(env.PIX_ENABLE_DEPOSITS).toBe('true');
    expect(env.PIX_ENABLE_WITHDRAWALS).toBe('true');
    expect(env.TREASURY_TARGET_PRIZE_RATIO).toBe('0.6');
  });

  it('throws when required environment variables are missing', () => {
    process.env = { NODE_ENV: 'development' } as any;

    expect(() => loadModule()).toThrow('Missing required environment variables: JWT_SECRET');
  });

  it('validates required production variables', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'live-secret',
    } as any;

    expect(() => loadModule()).toThrow(
      'Missing required production environment variables: MONGODB_URI, REDIS_URL',
    );

    process.env.MONGODB_URI = 'mongodb://prod';

    expect(() => loadModule()).toThrow(
      'Missing required production environment variables: REDIS_URL',
    );

    process.env.REDIS_URL = 'redis://prod';

    expect(() => loadModule()).not.toThrow();
  });
});
