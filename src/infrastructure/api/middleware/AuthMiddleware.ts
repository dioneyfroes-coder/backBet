import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@/shared/services/JwtService';

console.log('AuthMiddleware module loaded');

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

export const protectedRoute = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    let userId = req.auth?.userId;
    const authHeader = req.headers.authorization;

    if (!userId && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      console.log('protectedRoute token parts', token.split('.').length);
      if (looksLikeJwt(token)) {
        const decoded = jwtService.verifyAccessToken(token);
        console.log('protectedRoute decoded userId', decoded.userId);
        userId = decoded.userId;
        req.auth = {
          userId,
          sessionId: decoded.sessionId,
        };
      }
    }

    if (!userId && process.env.NODE_ENV === 'development') {
      if (authHeader && authHeader.startsWith('Bearer ')) {
        userId = authHeader.substring(7).trim();
        if (!req.auth) {
          req.auth = {
            userId,
            sessionId: 'dev-session',
          };
        }
      }
    }

    if (!userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Autenticação requerida',
          statusCode: 401,
        },
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token inválido',
        statusCode: 401,
      },
    });
  }
};

export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    next();
  } catch (error) {
    next();
  }
};
