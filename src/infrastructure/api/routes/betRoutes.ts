import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { createRouteRateLimiter } from '../middleware/routeRateLimiter';
import { cacheEventOddsMiddleware } from '../middleware/cacheMiddleware';
import { BetController } from '../controllers/BetController';
import { BetService } from '@core/betting/domain/services/BetService';
import {
  createBetRepository,
  createEventRepository,
  createWalletRepository,
} from '@/infrastructure/persistence/factory';
import { WalletService } from '@core/finance/domain/services/WalletService';
import { PlaceBetUseCase } from '@core/betting/aplication/use-cases/PlaceBetUseCase';
import { CancelBetUseCase } from '@core/betting/aplication/use-cases/CancelBetUseCase';
import { GetUserBetsUseCase } from '@core/betting/aplication/use-cases/GetUserBetsUseCase';
import { GetEventBetsUseCase } from '@core/betting/aplication/use-cases/GetEventUseCase';
import { IBetRepository } from '@core/betting/domain/repositories/IBetRepository';
import { IEventRepository } from '@core/betting/domain/repositories/IEventRepository';
import { IWalletRepository } from '@core/finance/domain/repositories/IWalletRepository';
import { appConfig } from '@/shared/config/appConfig';

export type BetRoutesDeps = {
  betRepository?: IBetRepository;
  eventRepository?: IEventRepository;
  walletRepository?: IWalletRepository;
};

export async function createBetRoutes(deps: BetRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const betRepository = deps.betRepository ?? (await createBetRepository());
  const eventRepository = deps.eventRepository ?? (await createEventRepository());
  const walletRepository = deps.walletRepository ?? (await createWalletRepository());
  const walletService = new WalletService(walletRepository as any);

  const betService = new BetService(betRepository as any, eventRepository as any, walletService);

  // use-cases (thin wrappers / orchestration)
  const placeBetUseCase = new PlaceBetUseCase(betService);
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
    asyncHandler((req, res) => betController.placeBet(req, res)),
  );
  router.post(
    '/:betId/cancel',
    protectedRoute,
    cancelLimiter,
    asyncHandler((req, res) => betController.cancelBet(req, res)),
  );
  router.get(
    '/me',
    protectedRoute,
    asyncHandler((req, res) => betController.getMyBets(req, res)),
  );

  return router;
}
