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
 * 
 * Em desenvolvimento, aceita qualquer header Authorization com userId
 */
export const protectedRoute = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Tentar obter do Clerk (produção)
    let userId = req.auth?.userId;

    // Fallback para desenvolvimento: tentar extrair do header
    if (!userId && process.env.NODE_ENV === 'development') {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        // Em desenvolvimento, o token pode ser simplesmente o userId
        userId = authHeader.substring(7);
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
