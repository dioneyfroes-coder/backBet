import { NextFunction, Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { redisClient } from '@/infrastructure/cache/RedisClient';
import { cacheConfig } from '@/shared/config/cacheConfig';
import { cacheKeys, cacheTTL } from '@/infrastructure/cache/cacheKeys';
import { AuthenticatedRequest } from './AuthMiddleware';

type AuthedQueryRequest = AuthenticatedRequest<
  ParamsDictionary,
  unknown,
  unknown,
  ParsedQs
>;

type CacheResponseOptions<Req extends Request> = {
  key: (req: Req) => string | null;
  ttlSeconds?: number;
  statusCodeOnHit?: number;
};

const safeParseNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const cacheResponse = <Req extends Request = Request, ResBody = unknown>({
  key,
  ttlSeconds,
  statusCodeOnHit = 200,
}: CacheResponseOptions<Req>) => {
  return async (req: Req, res: Response<ResBody>, next: NextFunction): Promise<void> => {
    if (!cacheConfig.enabled) {
      return next();
    }
    const cacheKey = key(req);
    if (!cacheKey) {
      return next();
    }

    try {
      const cached = await redisClient.get<ResBody>(cacheKey);
      if (cached) {
        res.status(statusCodeOnHit);
        res.json(cached);
        return;
      }
    } catch (error) {
      console.warn('Cache read failed', cacheKey, error);
    }

    const originalJson = res.json.bind(res);
    res.json = ((body?: ResBody) => {
      if (typeof body === 'undefined') {
        return originalJson(body);
      }
      const ttl = ttlSeconds ?? cacheConfig.defaultTTLSeconds;
      redisClient.set(cacheKey, body, ttl).catch((error) => {
        console.warn('Cache write failed', cacheKey, error);
      });
      return originalJson(body);
    }) as typeof res.json;

    next();
  };
};

const buildAuthenticatedCacheKey = (
  req: AuthenticatedRequest,
  formatter: (userId: string) => string,
): string | null => {
  const userId = req.auth?.userId;
  if (!userId) {
    return null;
  }
  return formatter(userId);
};

export const cacheWalletBalanceMiddleware = cacheResponse<AuthenticatedRequest>({
  key: (req) => buildAuthenticatedCacheKey(req, cacheKeys.walletBalance),
  ttlSeconds: cacheTTL.walletBalance,
});

export const cacheWalletHistoryMiddleware = cacheResponse<AuthedQueryRequest>({
  key: (req) => {
    const baseKey = buildAuthenticatedCacheKey(req, cacheKeys.walletHistory);
    if (!baseKey) {
      return null;
    }
    const limit = safeParseNumber(req.query.limit ?? '10', 10);
    const offset = safeParseNumber(req.query.offset ?? '0', 0);
    return `${baseKey}:limit=${limit}:offset=${offset}`;
  },
  ttlSeconds: cacheTTL.walletHistory,
});

export const cacheUserProfileMiddleware = cacheResponse<AuthenticatedRequest>({
  key: (req) => buildAuthenticatedCacheKey(req, cacheKeys.userProfile),
  ttlSeconds: cacheTTL.userProfile,
});

export const cacheEventOddsMiddleware = cacheResponse({
  key: (req) => {
    const eventId = req.params?.eventId;
    if (typeof eventId !== 'string' || eventId.length === 0) {
      return null;
    }
    return cacheKeys.oddsForEvent(eventId);
  },
  ttlSeconds: cacheTTL.oddsForEvent,
});
