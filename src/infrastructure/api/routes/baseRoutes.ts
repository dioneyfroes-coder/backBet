import { Router, Request, Response } from 'express';
import { appConfig } from '@/shared/config/appConfig';
import { cacheConfig } from '@/shared/config/cacheConfig';
import { getObservabilityToggles } from '@/shared/observability/featureToggles';

export type BaseRoutesDeps = {
  dependencyHealthProvider?: () => Record<'redis' | 'mongo', number>;
};

export const createBaseRoutes = (deps: BaseRoutesDeps = {}): Router => {
  const router = Router();

  /**
   * @openapi
   * /api:
   *   get:
   *     tags:
   *       - Health
   *     summary: Endpoint raiz da API
   *     responses:
   *       '200':
   *         description: Informações básicas do serviço
   */
  router.get('/', (_req: Request, res: Response) => {
    res.json({
      success: true,
      service: {
        name: appConfig.project.appName,
        serviceName: appConfig.project.serviceName,
        env: appConfig.runtime.env,
      },
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      links: {
        docs: '/api/docs',
        auth: '/api/auth',
        events: '/api/events',
        games: '/api/games',
        admin: '/api/admin',
      },
    });
  });

  /**
   * @openapi
   * /api/status:
   *   get:
   *     tags:
   *       - Health
   *     summary: Status resumido da API
   *     responses:
   *       '200':
   *         description: Status atual do serviço
   */
  router.get('/status', (_req: Request, res: Response) => {
    res.json({
      success: true,
      runtime: appConfig.runtime.env,
      observability: getObservabilityToggles(),
      cache: { enabled: cacheConfig.enabled },
      dependencies: deps.dependencyHealthProvider ? deps.dependencyHealthProvider() : null,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * @openapi
   * /api/links:
   *   get:
   *     tags:
   *       - Health
   *     summary: Lista endpoints úteis da API
   *     responses:
   *       '200':
   *         description: Mapa de rotas
   */
  router.get('/links', (_req: Request, res: Response) => {
    res.json({
      success: true,
      links: [
        { rel: 'docs', href: '/api/docs', description: 'Documentação completa' },
        { rel: 'health', href: '/health', description: 'Health-check legado' },
        { rel: 'events', href: '/api/events', description: 'Catálogo público de eventos' },
        { rel: 'games', href: '/api/games', description: 'Backend de jogos (coin flip)' },
        { rel: 'bets', href: '/api/bets', description: 'Gestão de apostas' },
        { rel: 'wallet', href: '/api/wallets', description: 'Saldos e transações' },
        { rel: 'admin', href: '/api/admin', description: 'Backoffice seguro' },
      ],
    });
  });

  return router;
};
