import { env } from './env';

const projectAppName = env.APP_NAME || 'backbet';
const projectServiceName = env.SERVICE_NAME || 'backbet-backend';
const newRelicAppName = env.NEW_RELIC_APP_NAME || projectAppName;
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

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value === 'undefined') {
    return fallback;
  }
  return value.toLowerCase() === 'true';
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
    newRelicAppName,
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
