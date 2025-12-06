import { env } from './env';

const projectAppName = env.APP_NAME || 'backbet';
const projectServiceName = env.SERVICE_NAME || 'backbet-backend';
const otelServiceName = env.OTEL_SERVICE_NAME || projectServiceName;
const defaultLogFilePath = env.LOG_FILE_PATH || 'logs/backbet.log';

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parsePositiveNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(value ?? '');
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(value ?? '');
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

const clampNumber = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value === 'undefined') {
    return fallback;
  }
  return value.toLowerCase() === 'true';
};

const parseRatio = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(value ?? '');
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 0.01), 0.99);
};

const parseRatioRange = (
  minValue: string | undefined,
  maxValue: string | undefined,
  fallbackMin: number,
  fallbackMax: number,
): { min: number; max: number } => {
  const minRatio = parseRatio(minValue, fallbackMin);
  const maxRatio = parseRatio(maxValue, fallbackMax);
  if (minRatio >= maxRatio) {
    return { min: fallbackMin, max: fallbackMax };
  }
  return { min: minRatio, max: maxRatio };
};

const parseList = (value: string | undefined, fallback: string[]): string[] => {
  if (!value) {
    return fallback;
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const parseHeaders = (value: string | undefined): Record<string, string> => {
  if (!value) {
    return {};
  }
  return value.split(/[;,]/).reduce<Record<string, string>>((acc, chunk) => {
    const [key, ...rest] = chunk.split('=').map((item) => item.trim());
    if (!key || rest.length === 0) {
      return acc;
    }
    acc[key.toLowerCase()] = rest.join('=');
    return acc;
  }, {});
};

const parseSameSite = (
  value: string | undefined,
  fallback: 'lax' | 'strict' | 'none',
): 'lax' | 'strict' | 'none' => {
  if (!value) {
    return fallback;
  }
  const normalized = value.toLowerCase();
  if (normalized === 'lax' || normalized === 'strict' || normalized === 'none') {
    return normalized;
  }
  return fallback;
};

const walletMinDeposit = parsePositiveNumber(env.WALLET_MIN_DEPOSIT, 1);
const walletMinWithdraw = Math.max(
  parsePositiveNumber(env.WALLET_MIN_WITHDRAW, 100),
  walletMinDeposit,
);
const prizeRatioRange = parseRatioRange(
  env.TREASURY_MIN_PRIZE_RATIO,
  env.TREASURY_MAX_PRIZE_RATIO,
  0.4,
  0.8,
);
const targetPrizeRatio = clampNumber(
  parseRatio(env.TREASURY_TARGET_PRIZE_RATIO, 0.6),
  prizeRatioRange.min,
  prizeRatioRange.max,
);

/**
 * CONFIGURAÇÃO CENTRALIZADA DA APLICAÇÃO
 *
 * Centraliza todas as configurações de forma segura e organizada.
 * Separação entre configurações públicas e sensíveis.
 */

export const appConfig = {
  runtime: {
    env: env.BACKBET_RUNTIME_ENV || env.NODE_ENV || 'development',
  },
  project: {
    appName: projectAppName,
    serviceName: projectServiceName,
  },
  logging: {
    level: env.LOG_LEVEL || 'info',
    file: {
      enabled: parseBoolean(env.LOG_FILE_ENABLED, env.NODE_ENV === 'production'),
      path: defaultLogFilePath,
      maxSizeBytes: parsePositiveInt(env.LOG_FILE_MAX_SIZE_MB, 20) * 1024 * 1024,
      maxFiles: Math.max(parsePositiveInt(env.LOG_FILE_MAX_FILES, 5), 1),
    },
  },
  observability: {
    usePm2WebUi: parseBoolean(env.OBS_USE_PM2_WEBUI, true),
    enablePrometheus: parseBoolean(env.OBS_ENABLE_PROMETHEUS, false),
    enableEmailAlerts: parseBoolean(env.OBS_ENABLE_EMAIL_ALERTS, true),
  },
  env: env.NODE_ENV || 'development',
  server: {
    port: parsePositiveInt(env.PORT, 3000),
  },
  security: {
    allowDevBearerBypass: parseBoolean(env.ALLOW_DEV_BEARER_BYPASS, false),
    enableHsts: parseBoolean(env.ENABLE_HSTS, env.NODE_ENV === 'production'),
  },
  auth: {
    autoActivateSignups: parseBoolean(env.AUTO_ACTIVATE_SIGNUPS, true),
    cookies: {
      refreshTokenName: env.AUTH_REFRESH_COOKIE_NAME || 'backbet_refresh_token',
      sessionIdName: env.AUTH_SESSION_COOKIE_NAME || 'backbet_session_id',
      domain: env.AUTH_COOKIE_DOMAIN,
      path: env.AUTH_COOKIE_PATH || '/',
      sameSite: parseSameSite(env.AUTH_COOKIE_SAMESITE, 'lax'),
      secure: parseBoolean(env.AUTH_COOKIE_SECURE, env.NODE_ENV === 'production'),
      maxAgeMs: parsePositiveInt(env.AUTH_REFRESH_COOKIE_MAX_AGE_DAYS, 7) * 24 * 60 * 60 * 1000,
    },
  },
  cors: {
    allowedOrigins: parseList(env.CORS_ALLOWED_ORIGINS, [
      'http://localhost:3000',
      'http://localhost:3001',
    ]),
    allowCredentials: parseBoolean(env.CORS_ALLOW_CREDENTIALS, true),
  },
  admin: {
    allowedUserIds: parseList(env.ADMIN_USER_IDS, []),
  },
  rateLimit: {
    windowMs: parsePositiveInt(env.RATE_LIMIT_WINDOW_MS, 600000), // 10 minutos
    max: parsePositiveInt(env.RATE_LIMIT_MAX, 5000), // alto para ambiente dev
    message:
      env.RATE_LIMIT_MESSAGE ||
      'Você excedeu o limite de requisições. Aguarde alguns instantes antes de tentar novamente.',
    enabled: parseBoolean(env.RATE_LIMIT_ENABLED, true),
  },
  authRateLimit: {
    register: {
      windowMs: parsePositiveInt(env.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS, 60_000),
      max: parsePositiveInt(env.AUTH_REGISTER_RATE_LIMIT_MAX, 10),
      message:
        env.AUTH_REGISTER_RATE_LIMIT_MESSAGE ||
        'Muitas tentativas de registro. Tente novamente em alguns segundos.',
    },
    login: {
      windowMs: parsePositiveInt(env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 60_000),
      max: parsePositiveInt(env.AUTH_LOGIN_RATE_LIMIT_MAX, 15),
      message:
        env.AUTH_LOGIN_RATE_LIMIT_MESSAGE ||
        'Muitas tentativas de login. Aguarde alguns segundos antes de tentar novamente.',
    },
    refresh: {
      windowMs: parsePositiveInt(env.AUTH_REFRESH_RATE_LIMIT_WINDOW_MS, 60_000),
      max: parsePositiveInt(env.AUTH_REFRESH_RATE_LIMIT_MAX, 30),
      message:
        env.AUTH_REFRESH_RATE_LIMIT_MESSAGE ||
        'Você excedeu o limite de refresh tokens. Tente novamente em breve.',
    },
  },
  wallet: {
    limits: {
      minDeposit: walletMinDeposit,
      minWithdraw: walletMinWithdraw,
    },
  },
  walletRateLimit: {
    deposit: {
      windowMs: parsePositiveInt(env.WALLET_DEPOSIT_RATE_LIMIT_WINDOW_MS, 60_000),
      max: parsePositiveInt(env.WALLET_DEPOSIT_RATE_LIMIT_MAX, 20),
      message:
        env.WALLET_DEPOSIT_RATE_LIMIT_MESSAGE ||
        'Muitas tentativas de depósito. Aguarde um momento e tente novamente.',
    },
    withdraw: {
      windowMs: parsePositiveInt(env.WALLET_WITHDRAW_RATE_LIMIT_WINDOW_MS, 60_000),
      max: parsePositiveInt(env.WALLET_WITHDRAW_RATE_LIMIT_MAX, 10),
      message:
        env.WALLET_WITHDRAW_RATE_LIMIT_MESSAGE ||
        'Muitas tentativas de saque. Aguarde um momento e tente novamente.',
    },
  },
  treasury: {
    walletId: env.TREASURY_WALLET_ID || 'house-primary',
    currency: (env.TREASURY_CURRENCY as 'BRL' | 'USD' | 'EUR') || 'BRL',
    targetPrizeRatio,
    prizeRatioRange,
    minProfitBuffer: parsePositiveNumber(env.TREASURY_MIN_PROFIT_BUFFER, 100_000),
    maxTransferPerRun: parsePositiveNumber(env.TREASURY_MAX_TRANSFER_PER_RUN, 250_000),
    rebalanceIntervalMs: parsePositiveInt(env.TREASURY_REBALANCE_INTERVAL_MS, 300_000),
  },
  betRateLimit: {
    place: {
      windowMs: parsePositiveInt(env.BET_PLACE_RATE_LIMIT_WINDOW_MS, 60_000),
      max: parsePositiveInt(env.BET_PLACE_RATE_LIMIT_MAX, 30),
      message:
        env.BET_PLACE_RATE_LIMIT_MESSAGE ||
        'Muitas tentativas de criar apostas. Reduza a frequência.',
    },
    cancel: {
      windowMs: parsePositiveInt(env.BET_CANCEL_RATE_LIMIT_WINDOW_MS, 60_000),
      max: parsePositiveInt(env.BET_CANCEL_RATE_LIMIT_MAX, 10),
      message:
        env.BET_CANCEL_RATE_LIMIT_MESSAGE ||
        'Muitas tentativas de cancelamento. Aguarde e tente novamente.',
    },
  },
  games: {
    coinFlip: {
      enabled: parseBoolean(env.GAME_COINFLIP_ENABLED, true),
      minBet: parsePositiveNumber(env.GAME_COINFLIP_MIN_BET, 1),
      maxBet: parsePositiveNumber(env.GAME_COINFLIP_MAX_BET, 500),
      payoutMultiplier: parsePositiveNumber(env.GAME_COINFLIP_PAYOUT_MULTIPLIER, 1),
      fixedWinAmount:
        env.GAME_COINFLIP_FIXED_WIN && parseNumber(env.GAME_COINFLIP_FIXED_WIN, 0) > 0
          ? parseNumber(env.GAME_COINFLIP_FIXED_WIN, 0)
          : undefined,
    },
    integration: {
      webhookEnabled: parseBoolean(env.GAME_INTEGRATION_WEBHOOK_ENABLED, false),
      webhookUrl: env.GAME_INTEGRATION_WEBHOOK_URL,
    },
  },
  payments: {
    pix: {
      provider: (env.PIX_PROVIDER as 'mock') || 'mock',
      providerName: env.PIX_PROVIDER_NAME || 'backbet-mock-pix',
      mockLatencyMs: parsePositiveInt(env.PIX_MOCK_LATENCY_MS, 25),
      defaultPixKey: env.PIX_DEFAULT_KEY || 'pix@backbet.mock',
      features: {
        depositsEnabled: parseBoolean(env.PIX_ENABLE_DEPOSITS, true),
        withdrawalsEnabled: parseBoolean(env.PIX_ENABLE_WITHDRAWALS, true),
      },
    },
  },
  jwt: {
    secret: env.JWT_SECRET as string,
    issuer: env.JWT_ISSUER || 'backbet',
    accessTokenExpiration: env.JWT_EXPIRATION || '15m',
    refreshTokenExpiration: env.JWT_REFRESH_EXPIRATION || '7d',
  },
  tracing: {
    enabled: parseBoolean(env.TRACING_ENABLED, false) && env.NODE_ENV !== 'test',
    exporterUrl: env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    exporterHeaders: parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    serviceName: otelServiceName,
    diagLogLevel: (env.OTEL_DIAGNOSTIC_LOG_LEVEL || 'error').toLowerCase(),
  },
};
