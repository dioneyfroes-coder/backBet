import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/shared/errors/AppError';

export type RouteRateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
};

export function createRouteRateLimiter(options: RouteRateLimitOptions) {
  const limiter = rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.ip,
    handler: (req: Request, _res: Response, next: NextFunction) => {
      next(
        new AppError('RATE_LIMIT_EXCEEDED', options.message || 'Too many requests for this endpoint', 429, {
          path: req.path,
          method: req.method,
          key: req.ip,
          prefix: options.keyPrefix,
        })
      );
    },
  });

  return limiter;
}
