describe('appConfig helpers', () => {
  const ORIGINAL_ENV = process.env;

  const loadConfig = () => {
    let moduleExports: typeof import('../appConfig');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      moduleExports = require('../appConfig');
    });
    return moduleExports!;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV } as any;
    process.env.JWT_SECRET = 'secret';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('falls back to safe defaults when numeric envs are invalid', () => {
    process.env.RATE_LIMIT_WINDOW_MS = 'not-a-number';
    process.env.RATE_LIMIT_MAX = '-1';
    process.env.RATE_LIMIT_ENABLED = 'false';

    const { appConfig } = loadConfig();

    expect(appConfig.rateLimit.windowMs).toBe(600000);
    expect(appConfig.rateLimit.max).toBe(5000);
    expect(appConfig.rateLimit.enabled).toBe(false);
  });

  it('parses comma-separated lists and booleans for CORS settings', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://one.com, https://two.com , ,';
    process.env.CORS_ALLOW_CREDENTIALS = 'false';

    const { appConfig } = loadConfig();

    expect(appConfig.cors.allowedOrigins).toEqual(['https://one.com', 'https://two.com']);
    expect(appConfig.cors.allowCredentials).toBe(false);
  });

  it('parses exporter headers into a normalized map', () => {
    process.env.TRACING_ENABLED = 'true';
    process.env.NODE_ENV = 'development';
    process.env.OTEL_EXPORTER_OTLP_HEADERS = 'api-key=123; another = value=2, spaced = data ';

    const { appConfig } = loadConfig();

    expect(appConfig.tracing.enabled).toBe(true);
    expect(appConfig.tracing.exporterHeaders).toEqual({
      'api-key': '123',
      another: 'value=2',
      spaced: 'data',
    });
  });

  it('exposes configurable wallet limits, treasury ratios and Pix toggles', () => {
    process.env.WALLET_MIN_DEPOSIT = '5';
    process.env.WALLET_MIN_WITHDRAW = '0.5';
    process.env.PIX_ENABLE_DEPOSITS = 'false';
    process.env.PIX_ENABLE_WITHDRAWALS = 'true';
    process.env.TREASURY_MIN_PRIZE_RATIO = '0.3';
    process.env.TREASURY_MAX_PRIZE_RATIO = '0.7';
    process.env.TREASURY_TARGET_PRIZE_RATIO = '0.9';

    const { appConfig } = loadConfig();

    expect(appConfig.wallet.limits).toEqual({ minDeposit: 5, minWithdraw: 5 });
    expect(appConfig.payments.pix.features).toEqual({
      depositsEnabled: false,
      withdrawalsEnabled: true,
    });
    expect(appConfig.treasury.prizeRatioRange).toEqual({ min: 0.3, max: 0.7 });
    expect(appConfig.treasury.targetPrizeRatio).toBe(0.7);
  });
});
