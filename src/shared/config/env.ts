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

const assignDefault = (name: string, value: string): void => {
  if (!process.env[name]) {
    process.env[name] = value;
  }
};

assignDefault('APP_NAME', 'backbet');
assignDefault('SERVICE_NAME', 'backbet-backend');
assignDefault(
  'NEW_RELIC_APP_NAME',
  process.env.NEW_RELIC_APP_NAME ?? process.env.APP_NAME ?? 'backbet',
);
assignDefault('OBS_USE_PM2_WEBUI', 'true');
assignDefault('OBS_ENABLE_PROMETHEUS', 'false');
assignDefault('OBS_ENABLE_EMAIL_ALERTS', 'true');

if (isTestEnv) {
  assignDefault('JWT_SECRET', 'test-secret');
  assignDefault('CLERK_SECRET_KEY', 'sk_test_dummy');
  assignDefault('CLERK_PUBLISHABLE_KEY', 'pk_test_dummy');
  assignDefault('MONGODB_URI', 'mongodb://localhost:27017/backbet-test');
  assignDefault('REDIS_URL', 'redis://localhost:6379');
}

const requiredAlways = ['JWT_SECRET'];
const requiredInProduction = [
  'CLERK_SECRET_KEY',
  'CLERK_PUBLISHABLE_KEY',
  'MONGODB_URI',
  'REDIS_URL',
];

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

  if (process.env.CLERK_SECRET_KEY?.includes('sk_test')) {
    throw new Error('CLERK_SECRET_KEY deve usar uma chave live em produção');
  }

  if (process.env.CLERK_PUBLISHABLE_KEY?.includes('pk_test')) {
    throw new Error('CLERK_PUBLISHABLE_KEY deve usar uma chave live em produção');
  }
}

type AppEnv = NodeJS.ProcessEnv & {
  NODE_ENV?: string;
  BACKBET_RUNTIME_ENV?: string;
  APP_NAME?: string;
  SERVICE_NAME?: string;
  NEW_RELIC_APP_NAME?: string;
  ADMIN_USER_IDS?: string;
  LOG_LEVEL?: string;
  LOG_FILE_ENABLED?: string;
  LOG_FILE_PATH?: string;
  LOG_FILE_MAX_SIZE_MB?: string;
  LOG_FILE_MAX_FILES?: string;
  OBS_USE_PM2_WEBUI?: string;
  OBS_ENABLE_PROMETHEUS?: string;
  OBS_ENABLE_EMAIL_ALERTS?: string;
  JWT_SECRET: string;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_API_KEY?: string;
  CLERK_API_URL?: string;
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
};

export const env = process.env as AppEnv;
