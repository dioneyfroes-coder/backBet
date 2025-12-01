import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  AuthenticatedRequest,
  protectedRoute,
  requireAdminRole,
} from '../middleware/AuthMiddleware';
import {
  createBetRepository,
  createEventRepository,
  createRiskRepository,
  createWalletRepository,
} from '@/infrastructure/persistence/factory';
import { AdminController } from '../controllers/AdminController';
import { IBetRepository } from '@core/betting/domain/repositories/IBetRepository';
import { IEventRepository } from '@core/betting/domain/repositories/IEventRepository';
import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { IWalletRepository } from '@core/finance/domain/repositories/IWalletRepository';
import { WalletService } from '@core/finance/domain/services/WalletService';
import { BetService } from '@core/betting/domain/services/BetService';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { EventCatalogService } from '@core/betting/domain/services/EventCatalogService';
import { ResolveBetUseCase } from '@core/betting/aplication/use-cases/ResolveBetUseCase';
import { UpdateEventStatusUseCase } from '@core/betting/aplication/use-cases/UpdateEventStatusUseCase';

export type AdminRoutesDeps = {
  betRepository?: IBetRepository;
  eventRepository?: IEventRepository;
  riskRepository?: IRiskRepository;
  walletRepository?: IWalletRepository;
  dependencyHealthProvider?: () => Record<'redis' | 'mongo', number>;
};

export async function createAdminRoutes(deps: AdminRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const betRepository: IBetRepository = deps.betRepository ?? (await createBetRepository());
  const eventRepository: IEventRepository = deps.eventRepository ?? (await createEventRepository());
  const walletRepository: IWalletRepository =
    deps.walletRepository ?? (await createWalletRepository());
  const riskRepository: IRiskRepository = deps.riskRepository ?? (await createRiskRepository());

  const walletService = new WalletService(walletRepository);
  const riskService = new RiskService(riskRepository, betRepository);
  const eventCatalogService = new EventCatalogService(eventRepository);
  const betService = new BetService(betRepository, eventRepository, walletService, riskService);

  const adminController = new AdminController(
    new ResolveBetUseCase(betService),
    new UpdateEventStatusUseCase(eventCatalogService),
    riskService,
    eventCatalogService,
    deps.dependencyHealthProvider,
  );

  // Admin endpoints
  router.get(
    '/overview',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.getOverview(req, res)),
  );

  router.get(
    '/risk/users/:userId',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.getRiskForUser(req, res)),
  );

  router.post(
    '/bets/:betId/settle',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.settleBet(req, res)),
  );

  router.patch(
    '/events/:eventId/status',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.updateEventStatus(req, res)),
  );

  return router;
}
