import { NextFunction, Request, Response } from 'express';
import { redisClient } from '@/infrastructure/cache/RedisClient';
import { cacheConfig } from '@/shared/config/cacheConfig';
import { cacheKeys, cacheTTL } from '@/infrastructure/cache/cacheKeys';
import { AuthenticatedRequest } from './AuthMiddleware';

type CacheResponseOptions = {
  key: (req: Request) => string | null;
  ttlSeconds?: number;
  statusCodeOnHit?: number;
};

const safeParseNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const cacheResponse = ({ key, ttlSeconds, statusCodeOnHit = 200 }: CacheResponseOptions) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!cacheConfig.enabled) {
      return next();
    }
    const cacheKey = key(req);
    if (!cacheKey) {
      return next();
    }

    try {
      const cached = await redisClient.get<any>(cacheKey);
      if (cached) {
        res.status(statusCodeOnHit);
        res.json(cached);
        return;
      }
    } catch (error) {
      console.warn('Cache read failed', cacheKey, error);
    }

    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      const ttl = ttlSeconds ?? cacheConfig.defaultTTLSeconds;
      redisClient.set(cacheKey, body, ttl).catch((error) => {
        console.warn('Cache write failed', cacheKey, error);
      });
      return originalJson(body);
    };

    next();
  };
};

const buildAuthenticatedCacheKey = (
  req: Request,
  formatter: (userId: string) => string,
): string | null => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.auth?.userId;
  if (!userId) {
    return null;
  }
  return formatter(userId);
};

export const cacheWalletBalanceMiddleware = cacheResponse({
  key: (req) => buildAuthenticatedCacheKey(req, cacheKeys.walletBalance),
  ttlSeconds: cacheTTL.walletBalance,
});

export const cacheWalletHistoryMiddleware = cacheResponse({
  key: (req) => {
    const authReq = req as AuthenticatedRequest;
    const baseKey = buildAuthenticatedCacheKey(req, cacheKeys.walletHistory);
    if (!baseKey) {
      return null;
    }
    const limit = safeParseNumber(authReq.query.limit ?? '10', 10);
    const offset = safeParseNumber(authReq.query.offset ?? '0', 0);
    return `${baseKey}:limit=${limit}:offset=${offset}`;
  },
  ttlSeconds: cacheTTL.walletHistory,
});

export const cacheUserProfileMiddleware = cacheResponse({
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
