import { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '@/shared/errors/AppError';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

export abstract class BaseController {
  protected ok<T>(res: Response, data: T, statusCode: number = 200): Response {
    return res.status(statusCode).json({
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
      },
    } as ApiResponse<T>);
  }

  protected created<T>(res: Response, data: T): Response {
    return this.ok(res, data, 201);
  }

  protected error(
    res: Response,
    code: string,
    message: string,
    statusCode: number = 400,
    details?: Record<string, any>
  ): Response {
    return res.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    } as ApiResponse);
  }

  protected badRequest(res: Response, message: string, details?: Record<string, any>): Response {
    return this.error(res, 'BAD_REQUEST', message, 400, details);
  }

  protected unauthorized(res: Response, message: string = 'Não autorizado'): Response {
    return this.error(res, 'UNAUTHORIZED', message, 401);
  }

  protected forbidden(res: Response, message: string = 'Acesso proibido'): Response {
    return this.error(res, 'FORBIDDEN', message, 403);
  }

  protected notFound(res: Response, message: string = 'Recurso não encontrado'): Response {
    return this.error(res, 'NOT_FOUND', message, 404);
  }

  protected conflict(res: Response, message: string): Response {
    return this.error(res, 'CONFLICT', message, 409);
  }

  protected internalError(res: Response, message: string = 'Erro interno do servidor'): Response {
    return this.error(res, 'INTERNAL_SERVER_ERROR', message, 500);
  }

  protected validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = (error as z.ZodError).issues.reduce(
          (acc: Record<string, string>, err: z.ZodIssue) => {
            const path = err.path.join('.');
            acc[path] = err.message;
            return acc;
          },
          {}
        );
        throw new AppError('VALIDATION_ERROR', 'Dados inválidos', 400, details);
      }
      throw error;
    }
  }

  protected async handleError(error: any, res: Response): Promise<Response> {
    console.error('Controller error:', error);

    if (error instanceof AppError) {
      return this.error(res, error.code, error.message, error.statusCode, error.details);
    }

    if (error.code === 'VALIDATION_ERROR') {
      return this.badRequest(res, error.message, error.details);
    }

    if (error instanceof z.ZodError) {
      const details = (error as z.ZodError).issues.reduce(
        (acc: Record<string, string>, err: z.ZodIssue) => {
          const path = err.path.join('.');
          acc[path] = err.message;
          return acc;
        },
        {}
      );
      return this.badRequest(res, 'Validação falhou', details);
    }

    return this.internalError(res, error.message || 'Erro desconhecido');
  }
}
