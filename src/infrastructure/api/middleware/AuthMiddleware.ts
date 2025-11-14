import { Request, Response, NextFunction } from 'express';

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

/**
 * Middleware que garante autenticação válida
 * Se não houver token ou for inválido, retorna 401
 */
export const protectedRoute = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.auth || {};

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

/**
 * Middleware opcional de autenticação
 * Se existir token, valida, mas não bloqueia se não existir
 */
export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Clerk já popula req.auth se houver token
    next();
  } catch (error) {
    next();
  }
};
