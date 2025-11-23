import { env } from './env';

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const cacheEnabled = env.CACHE_ENABLED?.toLowerCase() !== 'false' && env.NODE_ENV !== 'test';

export const cacheConfig = {
  redisUrl: env.REDIS_URL || 'redis://localhost:6379',
  defaultTTLSeconds: parsePositiveInt(env.CACHE_TTL_SECONDS, 60),
  userBalanceTTL: parsePositiveInt(env.CACHE_USER_BALANCE_TTL_SECONDS, 15),
  walletHistoryTTL: parsePositiveInt(env.CACHE_WALLET_HISTORY_TTL_SECONDS, 30),
  oddsTTL: parsePositiveInt(env.CACHE_ODDS_TTL_SECONDS, 10),
  enabled: cacheEnabled,
};
