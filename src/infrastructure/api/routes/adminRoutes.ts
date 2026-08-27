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
  createHouseTreasuryRepository,
  createLedgerRepository,
} from '@/infrastructure/persistence/factory';
import { AdminController } from '../controllers/AdminController';
import { IBetRepository } from '@core/betting/domain/repositories/IBetRepository';
import { IEventRepository } from '@core/betting/domain/repositories/IEventRepository';
import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { IWalletRepository } from '@core/finance/domain/repositories/IWalletRepository';
import { ILedgerRepository } from '@core/finance/domain/repositories/ILedgerRepository';
import { WalletService } from '@core/finance/domain/services/WalletService';
import { BetService } from '@core/betting/domain/services/BetService';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { EventCatalogService } from '@core/betting/domain/services/EventCatalogService';
import { ResolveBetUseCase } from '@core/betting/application/use-cases/ResolveBetUseCase';
import { UpdateEventStatusUseCase } from '@core/betting/application/use-cases/UpdateEventStatusUseCase';
import { TreasuryController } from '../controllers/TreasuryController';
import { IHouseTreasuryRepository } from '@/core/treasury/domain/repositories/IHouseTreasuryRepository';
import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { GetTreasurySummary } from '@/core/treasury/application/use-cases/GetTreasurySummary';
import { GetTreasuryLedger } from '@/core/treasury/application/use-cases/GetTreasuryLedger';
import { RecordTreasuryProfit } from '@/core/treasury/application/use-cases/RecordTreasuryProfit';
import { TransferProfitToPrize } from '@/core/treasury/application/use-cases/TransferProfitToPrize';
import { TransferPrizeToProfit } from '@/core/treasury/application/use-cases/TransferPrizeToProfit';
import { RebalanceTreasury } from '@/core/treasury/application/use-cases/RebalanceTreasury';
import { ReconcileTreasury } from '@/core/treasury/application/use-cases/ReconcileTreasury';
import { appConfig } from '@/shared/config/appConfig';
import { idempotencyService } from '@/shared/services/IdempotencyService';

export type AdminRoutesDeps = {
  betRepository?: IBetRepository;
  eventRepository?: IEventRepository;
  riskRepository?: IRiskRepository;
  walletRepository?: IWalletRepository;
  ledgerRepository?: ILedgerRepository;
  houseTreasuryRepository?: IHouseTreasuryRepository;
  dependencyHealthProvider?: () => Record<'redis' | 'mongo', number>;
};

export async function createAdminRoutes(deps: AdminRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const betRepository: IBetRepository = deps.betRepository ?? (await createBetRepository());
  const eventRepository: IEventRepository = deps.eventRepository ?? (await createEventRepository());
  const walletRepository: IWalletRepository =
    deps.walletRepository ?? (await createWalletRepository());
  const ledgerRepository: ILedgerRepository =
    deps.ledgerRepository ?? (await createLedgerRepository());
  const riskRepository: IRiskRepository = deps.riskRepository ?? (await createRiskRepository());
  const houseTreasuryRepository: IHouseTreasuryRepository =
    deps.houseTreasuryRepository ?? (await createHouseTreasuryRepository());

  const walletService = new WalletService(walletRepository, ledgerRepository);
  const riskService = new RiskService(riskRepository, betRepository);
  const eventCatalogService = new EventCatalogService(eventRepository);
  const betService = new BetService(betRepository, eventRepository, walletService, riskService);
  const treasuryService = new HouseTreasuryService(houseTreasuryRepository, {
    walletId: appConfig.treasury.walletId,
    currency: appConfig.treasury.currency,
  });

  const adminController = new AdminController(
    new ResolveBetUseCase(betService, idempotencyService),
    new UpdateEventStatusUseCase(eventCatalogService),
    riskService,
    eventCatalogService,
    deps.dependencyHealthProvider,
  );
  const treasuryController = new TreasuryController(
    new GetTreasurySummary(treasuryService),
    new GetTreasuryLedger(treasuryService),
    new RecordTreasuryProfit(treasuryService),
    new TransferProfitToPrize(treasuryService),
    new TransferPrizeToProfit(treasuryService),
    new ReconcileTreasury(treasuryService),
    new RebalanceTreasury(treasuryService),
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
    '/risk/users/:userId/reconcile',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.reconcileRiskForUser(req, res)),
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

  router.get(
    '/treasury/summary',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => treasuryController.getSummary(req, res)),
  );

  router.get(
    '/treasury/ledger',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => treasuryController.getLedger(req, res)),
  );

  router.post(
    '/treasury/profit',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => treasuryController.recordProfit(req, res)),
  );

  router.post(
    '/treasury/profit-to-prize',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) =>
      treasuryController.transferProfitToPrize(req, res),
    ),
  );

  router.post(
    '/treasury/prize-to-profit',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) =>
      treasuryController.transferPrizeToProfit(req, res),
    ),
  );

  router.post(
    '/treasury/rebalance',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => treasuryController.rebalance(req, res)),
  );

  router.post(
    '/treasury/reconcile',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => treasuryController.reconcile(req, res)),
  );

  return router;
}
