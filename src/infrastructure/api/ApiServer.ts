import express, { Express, Request, Response, NextFunction } from 'express';
import { clerkMiddleware, requireAuth } from '@clerk/express';
import cors from 'cors';
import helmet from 'helmet';

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

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ limit: '10mb', extended: true }));

    // Clerk authentication middleware
    this.app.use(clerkMiddleware());

    // Request ID para tracing
    this.app.use(this.requestIdMiddleware);

    // Logging
    this.app.use(this.loggingMiddleware);
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

  public registerRoutes(router: express.Router): void {
    this.app.use('/api', router);
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
      const message = err.message || 'Internal Server Error';

      res.status(statusCode).json({
        error: {
          code: err.code || 'INTERNAL_SERVER_ERROR',
          message,
          statusCode,
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
