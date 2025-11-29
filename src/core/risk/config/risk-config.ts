import { env } from '@shared/config/env';

export const RISK_CONFIG = {
  // maximum exposure allowed per user (in currency units)
  MAX_EXPOSURE_PER_USER: Number(env.RISK_MAX_EXPOSURE_PER_USER ?? 10000),
  // maximum single-stake allowed
  MAX_SINGLE_STAKE: Number(env.RISK_MAX_SINGLE_STAKE ?? 2000),
  // velocity controls: max bets per window (seconds)
  VELOCITY_WINDOW_SECONDS: Number(env.RISK_VELOCITY_WINDOW_SECONDS ?? 60),
  MAX_BETS_PER_WINDOW: Number(env.RISK_MAX_BETS_PER_WINDOW ?? 5),
  // per-event and per-market exposure limits
  MAX_EXPOSURE_PER_EVENT: Number(env.RISK_MAX_EXPOSURE_PER_EVENT ?? 5000),
  MAX_EXPOSURE_PER_MARKET: Number(env.RISK_MAX_EXPOSURE_PER_MARKET ?? 3000),
  // optional comma-separated lists
  WHITELIST_USER_IDS: (env.RISK_WHITELIST_USER_IDS ?? '').split(',').filter(Boolean),
  BLACKLIST_USER_IDS: (env.RISK_BLACKLIST_USER_IDS ?? '').split(',').filter(Boolean),
};

export type RiskConfig = typeof RISK_CONFIG;
