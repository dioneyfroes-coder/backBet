import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@/shared/services/JwtService';
import { appConfig } from '@/shared/config/appConfig';

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    sessionId: string;
    orgId?: string;
  };
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

const jwtService = new JwtService();
const looksLikeJwt = (token: string): boolean => token.split('.').length === 3;
const devBypassEnabled =
  process.env.NODE_ENV === 'development' && appConfig.security.allowDevBearerBypass;

const assignAuthFromHeader = (req: AuthenticatedRequest): void => {
  if (req.auth?.userId) {
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return;
  }

  const token = authHeader.substring(7).trim();

  if (looksLikeJwt(token)) {
    const decoded = jwtService.verifyAccessToken(token);
    req.auth = {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
    };
    return;
  }

  if (devBypassEnabled) {
    req.auth = {
      userId: token,
      sessionId: 'dev-session',
    };
  }
};

const unauthorizedResponse = (res: Response) =>
  res.status(401).json({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Autenticação requerida',
      statusCode: 401,
    },
  });

export const protectedRoute = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    assignAuthFromHeader(req);
  } catch (_error) {
    return unauthorizedResponse(res);
  }

  if (!req.auth?.userId) {
    return unauthorizedResponse(res);
  }

  return next();
};

export const optionalAuth = (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  try {
    assignAuthFromHeader(req);
  } finally {
    next();
  }
};
