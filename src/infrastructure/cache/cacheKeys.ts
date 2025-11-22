import { cacheConfig } from '@/shared/config/cacheConfig';

export const cacheKeys = {
  walletBalance: (userId: string) => `wallet:balance:${userId}`,
  walletHistory: (userId: string) => `wallet:history:${userId}`,
  userProfile: (userId: string) => `user:profile:${userId}`,
  oddsForEvent: (eventId: string) => `event:odds:${eventId}`,
};

export const cacheTTL = {
  walletBalance: cacheConfig.userBalanceTTL,
  walletHistory: cacheConfig.walletHistoryTTL,
  userProfile: cacheConfig.defaultTTLSeconds,
  oddsForEvent: cacheConfig.oddsTTL,
};
