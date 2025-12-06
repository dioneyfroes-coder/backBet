import { Request, Response, RequestHandler } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import passport from 'passport';
import { ExtractJwt, Strategy as JwtStrategy } from 'passport-jwt';
import type { StrategyOptionsWithoutRequest } from 'passport-jwt';
import { appConfig } from '@/shared/config/appConfig';
import type { JwtPayload } from '@/shared/services/JwtService';

export type AuthContext = {
  userId: string;
  sessionId: string;
};

export interface AuthenticatedRequest<
  Params extends ParamsDictionary = ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = ParsedQs,
  Locals extends Record<string, unknown> = Record<string, unknown>,
> extends Request<Params, ResBody, ReqBody, ReqQuery, Locals> {
  authContext?: AuthContext;
}
const looksLikeJwt = (token: string): boolean => token.split('.').length === 3;
const isDevBypassEnabled = (): boolean =>
  appConfig.runtime.env !== 'production' && appConfig.security.allowDevBearerBypass;

const applyDevBypass = (req: AuthenticatedRequest): boolean => {
  if (!isDevBypassEnabled()) {
    return false;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7).trim();
  if (looksLikeJwt(token)) {
    return false;
  }

  req.authContext = {
    userId: token,
    sessionId: 'dev-session',
  };
  return true;
};

let passportConfigured = false;

export const configurePassportJwt = (): void => {
  if (passportConfigured) {
    return;
  }

  const options: StrategyOptionsWithoutRequest = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: appConfig.jwt.secret,
    issuer: appConfig.jwt.issuer,
  };

  passport.use(
    new JwtStrategy(options, (payload: JwtPayload, done) => {
      if (!payload?.userId || payload.kind !== 'access') {
        return done(null, false);
      }
      return done(null, {
        userId: payload.userId,
        sessionId: payload.sessionId,
      });
    }),
  );

  passportConfigured = true;
};

export const attachAuthContext: RequestHandler = (req, res, next) => {
  const authedReq = req as AuthenticatedRequest;

  if (applyDevBypass(authedReq)) {
    return next();
  }

  passport.authenticate('jwt', { session: false }, (err: unknown, auth: AuthContext | false) => {
    if (err) {
      return next(err);
    }

    authedReq.authContext = auth || undefined;

    next();
  })(req, res, next);
};

const unauthorizedResponse = (res: Response) =>
  res.status(401).json({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Autenticação requerida',
      statusCode: 401,
    },
  });

export const protectedRoute: RequestHandler = (req, res, next) => {
  const authedReq = req as AuthenticatedRequest;

  if (!authedReq.authContext?.userId) {
    return unauthorizedResponse(res);
  }

  return next();
};

export const optionalAuth: RequestHandler = (_req, _res, next) => {
  next();
};

export const requireAdminRole: RequestHandler = (req, res, next) => {
  const authedReq = req as AuthenticatedRequest;
  const allowedIds = appConfig.admin?.allowedUserIds ?? [];
  if (!authedReq.authContext?.userId) {
    return unauthorizedResponse(res);
  }

  if (allowedIds.length === 0 || !allowedIds.includes(authedReq.authContext.userId)) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Acesso restrito ao backoffice',
        statusCode: 403,
      },
    });
  }

  return next();
};

export const getRequestUserId = (req: AuthenticatedRequest): string | undefined => {
  return req.authContext?.userId;
};
