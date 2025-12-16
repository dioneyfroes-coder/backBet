

import { redisClient } from './RedisClient';
import { cacheKeys, cacheTTL } from './cacheKeys';
import { cacheConfig } from '@/shared/config/cacheConfig';

export async function cacheWalletBalance<T>(userId: string, loader: () => Promise<T>): Promise<T> {
  const key = cacheKeys.walletBalance(userId);
  if (!cacheConfig.enabled) {
    return loader();
  }
  return redisClient.cached(key, cacheTTL.walletBalance, loader);
}

export async function cacheWalletHistory<T>(userId: string, loader: () => Promise<T>): Promise<T> {
  const key = cacheKeys.walletHistory(userId);
  if (!cacheConfig.enabled) {
    return loader();
  }
  return redisClient.cached(key, cacheTTL.walletHistory, loader);
}

export async function cacheUserProfile<T>(userId: string, loader: () => Promise<T>): Promise<T> {
  const key = cacheKeys.userProfile(userId);
  if (!cacheConfig.enabled) {
    return loader();
  }
  return redisClient.cached(key, cacheTTL.userProfile, loader);
}

export async function cacheEventOdds<T>(eventId: string, loader: () => Promise<T>): Promise<T> {
  const key = cacheKeys.oddsForEvent(eventId);
  if (!cacheConfig.enabled) {
    return loader();
  }
  return redisClient.cached(key, cacheTTL.oddsForEvent, loader);
}

export async function flushWalletCache(userId: string): Promise<void> {
  if (!cacheConfig.enabled) return;
  await Promise.all([
    redisClient.del(cacheKeys.walletBalance(userId)),
    redisClient.del(cacheKeys.walletHistory(userId)),
  ]);
}

export async function flushUserProfileCache(userId: string): Promise<void> {
  if (!cacheConfig.enabled) return;
  await redisClient.del(cacheKeys.userProfile(userId));
}

export async function flushEventOddsCache(eventId: string): Promise<void> {
  if (!cacheConfig.enabled) return;
  await redisClient.del(cacheKeys.oddsForEvent(eventId));
}
