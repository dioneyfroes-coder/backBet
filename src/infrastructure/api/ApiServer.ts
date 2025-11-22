import express, { Express, Request, Response, NextFunction } from 'express';
import { clerkMiddleware, requireAuth } from '@clerk/express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '../config/swagger';
import { AppError } from '@/shared/errors/AppError';
import { appConfig } from '@/shared/config/appConfig';

export class ApiServer {
  private app: Express;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    // Segurança
    this.app.use(helmet());

    // CORS - Inicialmente aberto, pode ser restringido depois
    this.app.use(
      cors({
        origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:3001'],
        credentials: true,
      })
    );

    // Rate limiting (alto para ambiente de desenvolvimento)
    if (appConfig.rateLimit.enabled) {
      this.app.use(
        rateLimit({
          windowMs: appConfig.rateLimit.windowMs,
          limit: appConfig.rateLimit.max,
          standardHeaders: true,
          legacyHeaders: false,
          message: appConfig.rateLimit.message,
          handler: (req: Request, _res, next: NextFunction) => {
            next(
              new AppError('RATE_LIMIT_EXCEEDED', appConfig.rateLimit.message, 429, {
                limit: appConfig.rateLimit.max,
                windowMs: appConfig.rateLimit.windowMs,
                path: req.path,
                method: req.method,
              }),
            );
          },
        }),
      );
    }

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ limit: '10mb', extended: true }));

    // Clerk authentication middleware - skip in development if not configured
    const isDevModeWithMockKeys = 
      process.env.NODE_ENV === 'development' && 
      process.env.CLERK_SECRET_KEY?.includes('sk_test');

    if (isDevModeWithMockKeys) {
      // Em desenvolvimento com valores mock, habilita header custom sem sobrescrever JWT
      this.app.use((req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7).trim();
          const looksLikeJwt = token.split('.').length === 3;
          if (!looksLikeJwt) {
            (req as any).auth = {
              userId: token,
              sessionId: 'dev-session',
            };
          }
        }
        next();
      });
    } else {
      // Em produção ou em desenvolvimento com valores reais, usar Clerk
      this.app.use(clerkMiddleware());
    }

    // Request ID para tracing
    this.app.use(this.requestIdMiddleware);

    // Logging
    this.app.use(this.loggingMiddleware);

    // Swagger UI - documentação OpenAPI
    // Serve a interface interativa em /api/docs e o JSON em /api/docs.json
    try {
      this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
      this.app.get('/api/docs.json', (_req: Request, res: Response) => res.json(swaggerSpec));
    } catch (err) {
      // se algo falhar aqui, não bloqueia a aplicação
      console.warn('Swagger UI não pôde ser montado:', err);
    }
  }

  private requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    (req as any).id = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  };

  private loggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    const original = res.send;

    res.send = function (data: any) {
      const duration = Date.now() - start;
      console.log(`[${(req as any).id}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
      return original.call(this, data);
    };

    next();
  };

  public getExpressApp(): Express {
    return this.app;
  }

  public start(): void {
    this.app.listen(this.port, () => {
      console.log(`🚀 BackBet API rodando em http://localhost:${this.port}`);
      console.log(`📚 Swagger: http://localhost:${this.port}/api/docs`);
    });
  }

  public registerRoutes(router: express.Router, prefix: string = ''): void {
    const fullPath = `/api${prefix}`;
    this.app.use(fullPath, router);
  }

  public registerHealthCheck(): void {
    this.app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    this.app.get('/readiness', (_req: Request, res: Response) => {
      // Adicionar validações de dependências aqui depois
      res.status(200).json({ ready: true });
    });
  }

  public registerErrorHandler(): void {
    this.app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Error:', err);

      const statusCode = err.statusCode || err.status || 500;
      const code = err.code || 'INTERNAL_SERVER_ERROR';
      const message = err.message || 'Internal Server Error';

      res.status(statusCode).json({
        success: false,
        error: {
          code,
          message,
          details: err.details,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: (_req as any).id,
        },
      });
    });
  }

  public get404Handler(): void {
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint não encontrado',
          statusCode: 404,
        },
      });
    });
  }
}

// Export singleton
export const createApiServer = (port?: number): ApiServer => new ApiServer(port);
