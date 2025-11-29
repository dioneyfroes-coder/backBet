import express, { Express, Request, Response, NextFunction } from 'express';
import { clerkMiddleware } from '@clerk/express';
import cors, { CorsOptions } from 'cors';
import helmet, { HelmetOptions } from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import mongoose from 'mongoose';
import { retryWithBackoff } from '@/shared/resilience/retryPolicy';
import { swaggerSpec } from '../config/swagger';
import { AppError } from '@/shared/errors/AppError';
import { appConfig } from '@/shared/config/appConfig';
import { cacheConfig } from '@/shared/config/cacheConfig';
import { redisClient } from '@/infrastructure/cache/RedisClient';
import {
  metricsRegistry,
  httpRequestCounter,
  httpRequestLatency,
  httpRequestLatencySeconds,
  httpErrorCounter,
  httpActiveRequests,
  dependencyHealthGauge,
} from '@/infrastructure/observability/metrics';
import {
  runWithRequestContext,
  updateRequestContext,
  getRequestContext,
} from '@/shared/observability/requestContext';
import {
  mongoCircuitBreaker,
  redisCircuitBreaker,
} from '@/shared/resilience/dependencyCircuitBreakers';
import {
  recordRetryAttempt,
  recordRetryFailure,
} from '@/infrastructure/observability/resilienceMetrics';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { getObservabilityToggles } from '@/shared/observability/featureToggles';
import { AuthenticatedRequest } from './middleware/AuthMiddleware';
import { RequestWithContext } from '@/types/http';

const MONGO_PING_RETRY_OPTIONS = {
  maxAttempts: 2,
  baseDelayMs: 150,
  factor: 2,
  jitter: 0.2,
  onRetry: () => recordRetryAttempt('mongo'),
};

type HealthCheckMap = Record<string, Record<string, unknown>>;

export class ApiServer {
  private app: Express;
  private port: number;
  private dependencyHealthSnapshot: Record<'redis' | 'mongo', number> = {
    redis: -1,
    mongo: -1,
  };

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.app.disable('x-powered-by');
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    const runtimeEnv = appConfig.runtime.env;
    const isProduction = runtimeEnv === 'production';

    const helmetOptions: HelmetOptions = {
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    };

    this.app.use(helmet(helmetOptions));

    if (appConfig.security.enableHsts && isProduction) {
      this.app.use(helmet.hsts({ maxAge: 15552000, includeSubDomains: true }));
    }

    this.app.use(helmet.frameguard({ action: 'deny' }));
    this.app.use(helmet.crossOriginResourcePolicy({ policy: 'same-origin' }));

    const allowedOrigins = new Set(appConfig.cors.allowedOrigins);
    const allowAllOrigins = allowedOrigins.has('*');
    type OriginCallback = (err: Error | null, allow?: boolean) => void;
    const validateOrigin = (origin: string | undefined, callback: OriginCallback): void => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowAllOrigins || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      console.warn(`Origin ${origin} blocked by CORS policy`);
      callback(new Error('Not allowed by CORS'));
    };

    const corsOptions: CorsOptions = {
      origin: validateOrigin,
      credentials: appConfig.cors.allowCredentials,
    };

    this.app.use(cors(corsOptions));

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
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    const hasValidClerkSecret = Boolean(clerkSecret && !clerkSecret.includes('sk_test'));
    if (isProduction && !hasValidClerkSecret) {
      throw new Error('CLERK_SECRET_KEY must be configured in production environments');
    }

    const allowDevBypass =
      runtimeEnv === 'test' ||
      (!hasValidClerkSecret && !isProduction) ||
      (runtimeEnv === 'development' && appConfig.security.allowDevBearerBypass);

    if (allowDevBypass) {
      // Em desenvolvimento com valores mock, habilita header custom sem sobrescrever JWT
      this.app.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7).trim();
          const looksLikeJwt = token.split('.').length === 3;
          if (!looksLikeJwt) {
            req.auth = {
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

    // Métricas Prometheus
    this.app.use(this.metricsMiddleware);

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

  private requestIdMiddleware = (
    req: RequestWithContext,
    res: Response,
    next: NextFunction,
  ): void => {
    const requestId =
      (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id']) ||
      `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const initialiseContext = () => {
      req.id = requestId;
      res.setHeader('X-Request-ID', requestId);
      next();
    };

    runWithRequestContext({ requestId, userId: undefined }, initialiseContext);
  };

  private loggingMiddleware = (
    req: RequestWithContext,
    res: Response,
    next: NextFunction,
  ): void => {
    const start = process.hrtime();
    const requestId = req.id;
    const userId = req.auth?.userId || req.user?.id;
    const clientIpHeader = req.headers['x-forwarded-for'];
    const clientIp = Array.isArray(clientIpHeader)
      ? clientIpHeader[0]
      : clientIpHeader?.split(',')[0].trim();
    const ip = clientIp || req.ip;

    updateRequestContext({ requestId, userId });

    const baseLog = {
      requestId,
      method: req.method,
      path: req.originalUrl,
      ip,
      userId,
    };

    writeStructuredLog({
      event: 'request_start',
      ...baseLog,
    });

    res.on('finish', () => {
      const duration = process.hrtime(start);
      const elapsedMs = duration[0] * 1000 + duration[1] / 1e6;
      writeStructuredLog({
        event: 'request_end',
        status: res.statusCode,
        durationMs: Number(elapsedMs.toFixed(2)),
        contentLength: res.getHeader('content-length'),
        ...baseLog,
      });
    });

    next();
  };

  private metricsMiddleware = (
    req: RequestWithContext,
    res: Response,
    next: NextFunction,
  ): void => {
    if (req.path === '/metrics') {
      return next();
    }

    const getRouteLabel = () => {
      const routePath = req.route?.path;
      if (typeof routePath === 'string') {
        return routePath;
      }
      if (routePath instanceof RegExp) {
        return routePath.source;
      }
      return req.path || req.originalUrl;
    };
    const method = req.method;
    const start = process.hrtime();
    httpActiveRequests.labels(method, getRouteLabel()).inc();

    let inFlightClosed = false;
    const finalizeActiveRequest = () => {
      if (inFlightClosed) {
        return getRouteLabel();
      }
      inFlightClosed = true;
      const routeLabel = getRouteLabel();
      httpActiveRequests.labels(method, routeLabel).dec();
      return routeLabel;
    };

    res.on('finish', () => {
      const route = finalizeActiveRequest();
      const labels = {
        method,
        route,
        status: res.statusCode.toString(),
      };
      const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
      httpRequestCounter.inc(labels);
      const duration = process.hrtime(start);
      const elapsedMs = duration[0] * 1000 + duration[1] / 1e6;
      httpRequestLatency.observe(labels, elapsedMs);
      httpRequestLatencySeconds.observe(
        { method, route, status_class: statusClass },
        elapsedMs / 1000,
      );
      if (res.statusCode >= 500) {
        httpErrorCounter.inc(labels);
      }
    });

    res.on('close', finalizeActiveRequest);

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
    // Root handshake endpoint to confirm the API is reachable
    this.app.get('/', (_req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        service: {
          name: appConfig.project.appName,
          serviceName: appConfig.project.serviceName,
          env: appConfig.runtime.env,
        },
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        dependencies: this.getDependencyHealthSnapshot(),
      });
    });

    this.app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        observability: getObservabilityToggles(),
      });
    });

    this.app.get('/readiness', this.readinessHandler);

    this.app.get('/health/cache', (_req: Request, res: Response) => {
      res.status(200).json({
        cache: {
          enabled: cacheConfig.enabled,
          metrics: cacheConfig.enabled ? redisClient.getMetrics() : null,
        },
        timestamp: new Date().toISOString(),
      });
    });
  }

  public registerMetricsEndpoint(): void {
    this.app.get('/metrics', async (_req: Request, res: Response) => {
      const toggles = getObservabilityToggles();
      if (!toggles.enablePrometheus) {
        return res.status(410).json({
          success: false,
          message:
            '/metrics foi desativado; acompanhe a stack via PM2 WebUI ou habilite OBS_ENABLE_PROMETHEUS=true durante a transição.',
        });
      }

      try {
        res.setHeader('Content-Type', metricsRegistry.contentType);
        res.send(await metricsRegistry.metrics());
      } catch (error) {
        console.error('Erro ao expor métricas Prometheus', error);
        res.status(500).send('Erro ao gerar métricas');
      }
    });
  }

  public registerErrorHandler(): void {
    this.app.use((err: unknown, req: RequestWithContext, res: Response, _next: NextFunction) => {
      const normalizedError = this.normalizeError(err);
      const statusCode = normalizedError.statusCode ?? normalizedError.status ?? 500;
      const code = normalizedError.code ?? 'INTERNAL_SERVER_ERROR';
      const requestContextSnapshot = getRequestContext();
      const requestId = requestContextSnapshot?.requestId || req.id;
      const timestamp = new Date().toISOString();
      const message = normalizedError.message ?? 'Erro interno inesperado';

      writeStructuredLog(
        {
          event: 'request_error',
          path: req.originalUrl,
          method: req.method,
          statusCode,
          code,
          requestId,
          details: normalizedError.details,
        },
        'error',
      );

      res.status(statusCode).json({
        success: false,
        error: {
          code,
          message,
          details: normalizedError.details,
        },
        meta: {
          timestamp,
          requestId,
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

  private readinessHandler = async (_req: RequestWithContext, res: Response): Promise<void> => {
    const checks: HealthCheckMap = {};
    let ready = true;
    const timestamp = new Date().toISOString();

    if (cacheConfig.enabled) {
      const redisNextAttempt = redisCircuitBreaker.getNextAttempt();
      if (redisCircuitBreaker.isOpen() && redisNextAttempt && Date.now() < redisNextAttempt) {
        ready = false;
        checks.redis = {
          status: 'down',
          reason: 'circuit_open',
          nextAttempt: new Date(redisNextAttempt).toISOString(),
          breakerState: redisCircuitBreaker.getState(),
        };
        this.setDependencyHealthMetric('redis', 0);
      } else {
        const start = Date.now();
        try {
          await redisClient.ping();
          checks.redis = {
            status: 'up',
            latencyMs: Date.now() - start,
            breakerState: redisCircuitBreaker.getState(),
          };
          this.setDependencyHealthMetric('redis', 1);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Redis ping failed';
          ready = false;
          checks.redis = {
            status: 'down',
            error: message,
            breakerState: redisCircuitBreaker.getState(),
          };
          this.setDependencyHealthMetric('redis', 0);
        }
      }
    } else {
      checks.redis = {
        status: 'skipped',
        reason: 'cache_disabled',
      };
      this.setDependencyHealthMetric('redis', -1);
    }

    const mongoEnabled = process.env.USE_MONGOOSE_PERSISTENCE === 'true';
    if (mongoEnabled) {
      const state = mongoose.connection.readyState;
      const mappedState = this.describeMongoState(state);
      if (state !== 1) {
        ready = false;
        checks.mongo = {
          status: 'down',
          state: mappedState,
        };
        this.setDependencyHealthMetric('mongo', 0);
      } else {
        const mongoNextAttempt = mongoCircuitBreaker.getNextAttempt();
        if (mongoCircuitBreaker.isOpen() && mongoNextAttempt && Date.now() < mongoNextAttempt) {
          ready = false;
          checks.mongo = {
            status: 'down',
            state: mappedState,
            reason: 'circuit_open',
            nextAttempt: new Date(mongoNextAttempt).toISOString(),
            breakerState: mongoCircuitBreaker.getState(),
          };
          this.setDependencyHealthMetric('mongo', 0);
        } else {
          const start = Date.now();
          try {
            await this.pingMongo();
            checks.mongo = {
              status: 'up',
              state: mappedState,
              latencyMs: Date.now() - start,
              breakerState: mongoCircuitBreaker.getState(),
            };
            this.setDependencyHealthMetric('mongo', 1);
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Mongo ping failed';
            ready = false;
            checks.mongo = {
              status: 'down',
              state: mappedState,
              error: message,
              breakerState: mongoCircuitBreaker.getState(),
            };
            this.setDependencyHealthMetric('mongo', 0);
          }
        }
      }
    } else {
      checks.mongo = {
        status: 'skipped',
        reason: 'mongoose_disabled',
      };
      this.setDependencyHealthMetric('mongo', -1);
    }

    res.status(ready ? 200 : 503).json({
      ready,
      timestamp,
      checks,
      observability: getObservabilityToggles(),
    });
  };

  private describeMongoState(state: number): string {
    const states: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };
    return states[state] ?? 'unknown';
  }

  private setDependencyHealthMetric(dependency: 'redis' | 'mongo', value: number): void {
    dependencyHealthGauge.labels(dependency).set(value);
    this.dependencyHealthSnapshot[dependency] = value;
  }

  public getDependencyHealthSnapshot(): Record<'redis' | 'mongo', number> {
    return { ...this.dependencyHealthSnapshot };
  }

  private async pingMongo(): Promise<void> {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('MongoDB connection not initialised');
    }
    try {
      await mongoCircuitBreaker.execute(() =>
        retryWithBackoff(() => db.admin().ping(), MONGO_PING_RETRY_OPTIONS),
      );
    } catch (error) {
      recordRetryFailure('mongo');
      throw error;
    }
  }

  private normalizeError(err: unknown): {
    statusCode?: number;
    status?: number;
    code?: string;
    message?: string;
    details?: unknown;
  } {
    if (typeof err === 'object' && err !== null) {
      return err as {
        statusCode?: number;
        status?: number;
        code?: string;
        message?: string;
        details?: unknown;
      };
    }
    return {};
  }
}

// Export singleton
export const createApiServer = (port?: number): ApiServer => new ApiServer(port);
