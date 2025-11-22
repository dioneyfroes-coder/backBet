import { redisClient } from './RedisClient';
import { cacheKeys, cacheTTL } from './cacheKeys';

export async function cacheWalletBalance<T>(userId: string, loader: () => Promise<T>): Promise<T> {
  const key = cacheKeys.walletBalance(userId);
  return redisClient.cached(key, cacheTTL.walletBalance, loader);
}

export async function cacheWalletHistory<T>(userId: string, loader: () => Promise<T>): Promise<T> {
  const key = cacheKeys.walletHistory(userId);
  return redisClient.cached(key, cacheTTL.walletHistory, loader);
}

export async function cacheUserProfile<T>(userId: string, loader: () => Promise<T>): Promise<T> {
  const key = cacheKeys.userProfile(userId);
  return redisClient.cached(key, cacheTTL.userProfile, loader);
}

export async function cacheEventOdds<T>(eventId: string, loader: () => Promise<T>): Promise<T> {
  const key = cacheKeys.oddsForEvent(eventId);
  return redisClient.cached(key, cacheTTL.oddsForEvent, loader);
}

export async function flushWalletCache(userId: string): Promise<void> {
  await Promise.all([
    redisClient.del(cacheKeys.walletBalance(userId)),
    redisClient.del(cacheKeys.walletHistory(userId)),
  ]);
}

export async function flushUserProfileCache(userId: string): Promise<void> {
  await redisClient.del(cacheKeys.userProfile(userId));
}

export async function flushEventOddsCache(eventId: string): Promise<void> {
  await redisClient.del(cacheKeys.oddsForEvent(eventId));
}
