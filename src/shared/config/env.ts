import { config } from 'dotenv';

/**
 * Carregamento de variáveis de ambiente
 * Este arquivo deve ser importado ANTES de qualquer outro módulo que dependa de configurações.
 */

const result = config();

if (result.error && (result.error as { code?: string }).code !== 'ENOENT') {
  console.warn('Falha ao carregar .env:', result.error.message);
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const BACKBET_RUNTIME_ENV = process.env.BACKBET_RUNTIME_ENV || NODE_ENV;
if (!process.env.BACKBET_RUNTIME_ENV) {
  process.env.BACKBET_RUNTIME_ENV = BACKBET_RUNTIME_ENV;
}
const isTestEnv = BACKBET_RUNTIME_ENV === 'test';
const isProduction = BACKBET_RUNTIME_ENV === 'production';

if (!process.env.BACKBET_ENV_LOGGED) {
  process.env.BACKBET_ENV_LOGGED = 'true';
  console.log('[env] snapshot', {
    NODE_ENV,
    BACKBET_RUNTIME_ENV,
    authStrategy: 'passport-jwt',
    hasJwtSecret: Boolean(process.env.JWT_SECRET),
    allowDevBypass: process.env.ALLOW_DEV_BEARER_BYPASS === 'true',
    jwtIssuer: process.env.JWT_ISSUER || 'backbet',
  });
}

const assignDefault = (name: string, value: string): void => {
  if (!process.env[name]) {
    process.env[name] = value;
  }
};

assignDefault('APP_NAME', 'backbet');
assignDefault('SERVICE_NAME', 'backbet-backend');
assignDefault('OBS_USE_PM2_WEBUI', 'true');
assignDefault('OBS_ENABLE_PROMETHEUS', 'false');
assignDefault('OBS_ENABLE_EMAIL_ALERTS', 'true');
assignDefault('ALLOW_DEV_BEARER_BYPASS', 'false');
assignDefault('PIX_PROVIDER', 'mock');
assignDefault('PIX_DEFAULT_KEY', 'pix@backbet.mock');
assignDefault('WALLET_MIN_DEPOSIT', '1');
assignDefault('WALLET_MIN_WITHDRAW', '100');
assignDefault('PIX_ENABLE_DEPOSITS', 'true');
assignDefault('PIX_ENABLE_WITHDRAWALS', 'true');
assignDefault('TREASURY_TARGET_PRIZE_RATIO', '0.6');
assignDefault('TREASURY_MIN_PRIZE_RATIO', '0.4');
assignDefault('TREASURY_MAX_PRIZE_RATIO', '0.8');

if (isTestEnv) {
  assignDefault('JWT_SECRET', 'test-secret');
  assignDefault('MONGODB_URI', 'mongodb://localhost:27017/backbet-test');
  assignDefault('REDIS_URL', 'redis://localhost:6379');
}

const requiredAlways = ['JWT_SECRET'];
const requiredInProduction = ['MONGODB_URI', 'REDIS_URL'];

const missingAlways = requiredAlways.filter((name) => !process.env[name]);
if (missingAlways.length > 0) {
  throw new Error(`Missing required environment variables: ${missingAlways.join(', ')}`);
}

if (isProduction) {
  const missingProdVars = requiredInProduction.filter((name) => !process.env[name]);
  if (missingProdVars.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missingProdVars.join(', ')}`,
    );
  }
}

type AppEnv = NodeJS.ProcessEnv & {
  NODE_ENV?: string;
  BACKBET_RUNTIME_ENV?: string;
  APP_NAME?: string;
  SERVICE_NAME?: string;
  ADMIN_USER_IDS?: string;
  AUTO_ACTIVATE_SIGNUPS?: string;
  LOG_LEVEL?: string;
  LOG_FILE_ENABLED?: string;
  LOG_FILE_PATH?: string;
  LOG_FILE_MAX_SIZE_MB?: string;
  LOG_FILE_MAX_FILES?: string;
  AUTH_REFRESH_COOKIE_NAME?: string;
  AUTH_SESSION_COOKIE_NAME?: string;
  AUTH_COOKIE_DOMAIN?: string;
  AUTH_COOKIE_PATH?: string;
  AUTH_COOKIE_SAMESITE?: string;
  AUTH_COOKIE_SECURE?: string;
  AUTH_REFRESH_COOKIE_MAX_AGE_DAYS?: string;
  OBS_USE_PM2_WEBUI?: string;
  OBS_ENABLE_PROMETHEUS?: string;
  OBS_ENABLE_EMAIL_ALERTS?: string;
  JWT_SECRET: string;
  JWT_ISSUER?: string;
  JWT_AUDIENCE?: string;
  JWT_EXPIRATION?: string;
  JWT_REFRESH_EXPIRATION?: string;
  ALLOW_DEV_BEARER_BYPASS?: string;
  MONGODB_URI?: string;
  REDIS_URL?: string;
  TRACING_ENABLED?: string;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  OTEL_SERVICE_NAME?: string;
  OTEL_DIAGNOSTIC_LOG_LEVEL?: string;
  GAME_COINFLIP_ENABLED?: string;
  GAME_COINFLIP_MIN_BET?: string;
  GAME_COINFLIP_MAX_BET?: string;
  GAME_COINFLIP_PAYOUT_MULTIPLIER?: string;
  GAME_COINFLIP_FIXED_WIN?: string;
  GAME_INTEGRATION_WEBHOOK_ENABLED?: string;
  GAME_INTEGRATION_WEBHOOK_URL?: string;
  TREASURY_WALLET_ID?: string;
  TREASURY_CURRENCY?: string;
  TREASURY_TARGET_PRIZE_RATIO?: string;
  TREASURY_MIN_PRIZE_RATIO?: string;
  TREASURY_MAX_PRIZE_RATIO?: string;
  TREASURY_MIN_PROFIT_BUFFER?: string;
  TREASURY_MAX_TRANSFER_PER_RUN?: string;
  TREASURY_REBALANCE_INTERVAL_MS?: string;
  PIX_PROVIDER?: string;
  PIX_PROVIDER_NAME?: string;
  PIX_MOCK_LATENCY_MS?: string;
  PIX_DEFAULT_KEY?: string;
  PIX_ENABLE_DEPOSITS?: string;
  PIX_ENABLE_WITHDRAWALS?: string;
  WALLET_MIN_DEPOSIT?: string;
  WALLET_MIN_WITHDRAW?: string;
};

export const env = process.env as AppEnv;
