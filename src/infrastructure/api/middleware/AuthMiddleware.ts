import { Request, Response, RequestHandler } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import passport from 'passport';
import { ExtractJwt, Strategy as JwtStrategy } from 'passport-jwt';
import type { StrategyOptionsWithoutRequest } from 'passport-jwt';
import { appConfig } from '@/shared/config/appConfig';
import type { JwtPayload } from '@/shared/services/JwtService';
import { getSessionService } from '@/core/auth/domain/services/SessionServiceSingleton';

export type AuthContext = {
  userId: string;
  sessionId: string;
  /** 'jwt' indica token real (validação de sessão aplica); 'dev' ou ausente pula o gate. */
  authType?: 'jwt' | 'dev';
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

type SessionGate = (auth: AuthContext) => Promise<void>;

// Gate default: valida que a sessão segue ativa (logout/suspensão/rotação
// revogam imediatamente). Pode ser substituído em testes finos.
let sessionGate: SessionGate | null = async (auth) => {
  const sessionService = await getSessionService();
  await sessionService.assertActiveSession(auth.sessionId, auth.userId);
};

export const configureAuthSessionGate = (gate: SessionGate | null): SessionGate | null => {
  const previous = sessionGate;
  sessionGate = gate;
  return previous;
};

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
    authType: 'dev',
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
    secretOrKey: appConfig.jwt.accessSecret ?? appConfig.jwt.secret,
    issuer: appConfig.jwt.issuer,
  };
  if (appConfig.jwt.audience) {
    options.audience = appConfig.jwt.audience;
  }

  passport.use(
    new JwtStrategy(options, (payload: JwtPayload, done) => {
      if (!payload?.userId || payload.kind !== 'access') {
        return done(null, false);
      }
      return done(null, {
        userId: payload.userId,
        sessionId: payload.sessionId,
        authType: 'jwt',
      } satisfies AuthContext);
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

// Async para poder validar a sessão (Fase 9) sem travar o event loop.
export const protectedRoute: RequestHandler = async (req, res, next) => {
  const authedReq = req as AuthenticatedRequest;

  if (!authedReq.authContext?.userId) {
    return unauthorizedResponse(res);
  }

  const auth = authedReq.authContext;
  if (auth.authType === 'jwt' && sessionGate) {
    try {
      await sessionGate(auth);
    } catch (error) {
      if (error instanceof Error && (error as { statusCode?: number }).statusCode === 401) {
        return unauthorizedResponse(res);
      }
      return next(error);
    }
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

export type RoleName = 'admin' | 'finance';

/**
 * Matriz de autorização (Fase 9): permite acesso se o usuário pertence a pelo
 * menos uma das listas da role solicitada. Admin vem de ADMIN_USER_IDS e
 * Finance de FINANCE_USER_IDS.
 */
export const requireAnyRole =
  (roles: RoleName[]): RequestHandler =>
  (req, res, next) => {
    const authedReq = req as AuthenticatedRequest;
    const userId = authedReq.authContext?.userId;
    if (!userId) {
      return unauthorizedResponse(res);
    }

    const adminIds = appConfig.admin?.allowedUserIds ?? [];
    const financeIds = appConfig.finance?.allowedUserIds ?? [];

    const hasRole = roles.some((role) => {
      if (role === 'admin') return adminIds.includes(userId);
      if (role === 'finance') return financeIds.includes(userId);
      return false;
    });

    if (!hasRole) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Acesso restrito',
          statusCode: 403,
        },
      });
    }

    return next();
  };

export const getRequestUserId = (req: AuthenticatedRequest): string | undefined => {
  return req.authContext?.userId;
};