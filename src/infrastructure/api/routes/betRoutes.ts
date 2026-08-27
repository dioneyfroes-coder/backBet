import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AuthenticatedRequest, protectedRoute } from '../middleware/AuthMiddleware';
import { createRouteRateLimiter } from '../middleware/routeRateLimiter';
import { cacheEventOddsMiddleware } from '../middleware/cacheMiddleware';
import { BetController } from '../controllers/BetController';
import { BetService } from '@core/betting/domain/services/BetService';
import {
  createBetRepository,
  createEventRepository,
  createWalletRepository,
  createLedgerRepository,
} from '@/infrastructure/persistence/factory';
import { createRiskRepository } from '@/infrastructure/persistence/factory';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { WalletService } from '@core/finance/domain/services/WalletService';
import { PlaceBetUseCase } from '@core/betting/application/use-cases/PlaceBetUseCase';
import { CancelBetUseCase } from '@core/betting/application/use-cases/CancelBetUseCase';
import { GetUserBetsUseCase } from '@core/betting/application/use-cases/GetUserBetsUseCase';
import { GetEventBetsUseCase } from '@core/betting/application/use-cases/GetEventUseCase';
import { IBetRepository } from '@core/betting/domain/repositories/IBetRepository';
import { IEventRepository } from '@core/betting/domain/repositories/IEventRepository';
import { IWalletRepository } from '@core/finance/domain/repositories/IWalletRepository';
import { ILedgerRepository } from '@core/finance/domain/repositories/ILedgerRepository';
import { appConfig } from '@/shared/config/appConfig';
import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { idempotencyService } from '@/shared/services/IdempotencyService';

export type BetRoutesDeps = {
  betRepository?: IBetRepository;
  eventRepository?: IEventRepository;
  walletRepository?: IWalletRepository;
  ledgerRepository?: ILedgerRepository;
};

export async function createBetRoutes(deps: BetRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const betRepository: IBetRepository = deps.betRepository ?? (await createBetRepository());
  const eventRepository: IEventRepository = deps.eventRepository ?? (await createEventRepository());
  const walletRepository: IWalletRepository =
    deps.walletRepository ?? (await createWalletRepository());
  const ledgerRepository: ILedgerRepository =
    deps.ledgerRepository ?? (await createLedgerRepository());
  const walletService = new WalletService(walletRepository, ledgerRepository);

  const riskRepository: IRiskRepository = await createRiskRepository();
  const riskService = new RiskService(riskRepository, betRepository);

  const transactionRunner = walletRepository.withTransaction
    ? { withTransaction: walletRepository.withTransaction.bind(walletRepository) }
    : undefined;
  const betService = new BetService(
    betRepository,
    eventRepository,
    walletService,
    riskService,
    transactionRunner,
  );

  // use-cases (thin wrappers / orchestration)
  const placeBetUseCase = new PlaceBetUseCase(betService, idempotencyService);
  const cancelBetUseCase = new CancelBetUseCase(betService);
  const getUserBetsUseCase = new GetUserBetsUseCase(betService);
  const getEventBetsUseCase = new GetEventBetsUseCase(betService);

  const betController = new BetController(
    placeBetUseCase,
    cancelBetUseCase,
    getUserBetsUseCase,
    getEventBetsUseCase,
  );

  const placeLimiter = createRouteRateLimiter({
    ...appConfig.betRateLimit.place,
    keyPrefix: 'bet-place',
  });

  const cancelLimiter = createRouteRateLimiter({
    ...appConfig.betRateLimit.cancel,
    keyPrefix: 'bet-cancel',
  });

  router.get(
    '/event/:eventId',
    cacheEventOddsMiddleware,
    asyncHandler((req, res) => betController.getEventBets(req, res)),
  );
  router.post(
    '/',
    protectedRoute,
    placeLimiter,
    asyncHandler((req: AuthenticatedRequest, res) => betController.placeBet(req, res)),
  );
  router.post(
    '/:betId/cancel',
    protectedRoute,
    cancelLimiter,
    asyncHandler((req: AuthenticatedRequest, res) => betController.cancelBet(req, res)),
  );
  router.get(
    '/me',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res) => betController.getMyBets(req, res)),
  );

  return router;
}
