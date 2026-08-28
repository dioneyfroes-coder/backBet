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
assignDefault('MONEY_SECURITY_MAX_DEPOSIT', '5000');
assignDefault('MONEY_SECURITY_MAX_WITHDRAWAL', '10000');
assignDefault('MONEY_SECURITY_MAX_DEPOSIT_PER_DAY', '20000');
assignDefault('MONEY_SECURITY_MAX_WITHDRAWAL_PER_DAY', '25000');
assignDefault('MONEY_SECURITY_MAX_DEPOSITS_PER_DAY', '20');
assignDefault('MONEY_SECURITY_MAX_WITHDRAWALS_PER_DAY', '5');
assignDefault('MONEY_SECURITY_VELOCITY_ENABLED', 'true');
assignDefault('MONEY_SECURITY_VELOCITY_WINDOW_MS', '600000');
assignDefault('MONEY_SECURITY_VELOCITY_MAX_WITHDRAWALS', '3');
assignDefault('MONEY_SECURITY_PIX_CHANGE_ENABLED', 'true');
assignDefault('MONEY_SECURITY_PIX_CHANGE_COOLDOWN_MS', '86400000');
assignDefault('MONEY_SECURITY_MULTI_ACCOUNT_ENABLED', 'true');
assignDefault('MONEY_SECURITY_ANOMALY_ENABLED', 'true');
assignDefault('MONEY_SECURITY_MIN_ACCOUNT_AGE_MS', '86400000');
assignDefault('MONEY_SECURITY_MAX_WITHDRAWAL_NEW_ACCOUNT', '200');
assignDefault('MONEY_SECURITY_FAILED_ATTEMPTS_ENABLED', 'true');
assignDefault('MONEY_SECURITY_FAILED_ATTEMPTS_WINDOW_MS', '86400000');
assignDefault('MONEY_SECURITY_FAILED_ATTEMPTS_MAX', '5');
assignDefault('RESPONSIBLE_GAMBLING_ENABLED', 'true');
assignDefault('RESPONSIBLE_GAMBLING_MIN_DEPOSIT_LIMIT_CENTS', '100');
assignDefault('RESPONSIBLE_GAMBLING_MIN_BET_LIMIT_CENTS', '100');
assignDefault('COMPLIANCE_KYC_ENABLED', 'true');
assignDefault('COMPLIANCE_KYC_PROVIDER', 'mock');
assignDefault('COMPLIANCE_GEOLOCATION_ENABLED', 'false');
assignDefault('COMPLIANCE_GEOLOCATION_PROVIDER', 'noop');
assignDefault('COMPLIANCE_DEVICE_INTEGRITY_ENABLED', 'false');
assignDefault('COMPLIANCE_DEVICE_INTEGRITY_PROVIDER', 'noop');
assignDefault('COMPLIANCE_WITHDRAWAL_REQUIRES_VERIFIED_IDENTITY_ABOVE', '20000');
assignDefault('AUDIT_ENABLED', 'true');
assignDefault('AUDIT_ACCESS_LOG_ENABLED', 'false');
assignDefault('AUDIT_RETENTION_DAYS', '1825');
assignDefault('AUDIT_RETENTION_JOB_INTERVAL_MS', '86400000');
assignDefault('AUDIT_QUERY_DEFAULT_LIMIT', '50');
assignDefault('AUDIT_QUERY_MAX_LIMIT', '200');
assignDefault('SIGAP_ENABLED', 'false');
assignDefault('SIGAP_PROVIDER', 'mock');
assignDefault('SIGAP_OPERATOR_ID', 'backbet-operator');
assignDefault('SIGAP_IMPEDIMENT_ENABLED', 'false');
assignDefault('SIGAP_IMPEDED_DOCUMENTS', '');
assignDefault('SIGAP_TRANSMISSION_JOB_INTERVAL_MS', '86400000');
assignDefault('SIGAP_QUERY_DEFAULT_LIMIT', '50');
assignDefault('SIGAP_QUERY_MAX_LIMIT', '200');

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
  MONEY_SECURITY_MAX_DEPOSIT?: string;
  MONEY_SECURITY_MAX_WITHDRAWAL?: string;
  MONEY_SECURITY_MAX_DEPOSIT_PER_DAY?: string;
  MONEY_SECURITY_MAX_WITHDRAWAL_PER_DAY?: string;
  MONEY_SECURITY_MAX_DEPOSITS_PER_DAY?: string;
  MONEY_SECURITY_MAX_WITHDRAWALS_PER_DAY?: string;
  MONEY_SECURITY_VELOCITY_ENABLED?: string;
  MONEY_SECURITY_VELOCITY_WINDOW_MS?: string;
  MONEY_SECURITY_VELOCITY_MAX_WITHDRAWALS?: string;
  MONEY_SECURITY_PIX_CHANGE_ENABLED?: string;
  MONEY_SECURITY_PIX_CHANGE_COOLDOWN_MS?: string;
  MONEY_SECURITY_MULTI_ACCOUNT_ENABLED?: string;
  MONEY_SECURITY_ANOMALY_ENABLED?: string;
  MONEY_SECURITY_MIN_ACCOUNT_AGE_MS?: string;
  MONEY_SECURITY_MAX_WITHDRAWAL_NEW_ACCOUNT?: string;
  MONEY_SECURITY_FAILED_ATTEMPTS_ENABLED?: string;
  MONEY_SECURITY_FAILED_ATTEMPTS_WINDOW_MS?: string;
  MONEY_SECURITY_FAILED_ATTEMPTS_MAX?: string;
  RESPONSIBLE_GAMBLING_ENABLED?: string;
  RESPONSIBLE_GAMBLING_MIN_DEPOSIT_LIMIT_CENTS?: string;
  RESPONSIBLE_GAMBLING_MIN_BET_LIMIT_CENTS?: string;
  COMPLIANCE_KYC_ENABLED?: string;
  COMPLIANCE_KYC_PROVIDER?: string;
  COMPLIANCE_GEOLOCATION_ENABLED?: string;
  COMPLIANCE_GEOLOCATION_PROVIDER?: string;
  COMPLIANCE_DEVICE_INTEGRITY_ENABLED?: string;
  COMPLIANCE_DEVICE_INTEGRITY_PROVIDER?: string;
  COMPLIANCE_WITHDRAWAL_REQUIRES_VERIFIED_IDENTITY_ABOVE?: string;
  AUDIT_ENABLED?: string;
  AUDIT_ACCESS_LOG_ENABLED?: string;
  AUDIT_RETENTION_DAYS?: string;
  AUDIT_RETENTION_JOB_INTERVAL_MS?: string;
  AUDIT_QUERY_DEFAULT_LIMIT?: string;
  AUDIT_QUERY_MAX_LIMIT?: string;
  SIGAP_ENABLED?: string;
  SIGAP_PROVIDER?: string;
  SIGAP_OPERATOR_ID?: string;
  SIGAP_IMPEDIMENT_ENABLED?: string;
  SIGAP_IMPEDED_DOCUMENTS?: string;
  SIGAP_TRANSMISSION_JOB_INTERVAL_MS?: string;
  SIGAP_QUERY_DEFAULT_LIMIT?: string;
  SIGAP_QUERY_MAX_LIMIT?: string;
};

export const env = process.env as AppEnv;
