import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { BetController } from '../controllers/BetController';
import { BetService } from '@core/betting/domain/services/BetService';
import { createBetRepository, createEventRepository, createWalletRepository } from '@/infrastructure/persistence/factory';
import { WalletService } from '@core/finance/domain/services/WalletService';
import { PlaceBetUseCase } from '@core/betting/aplication/use-cases/PlaceBetUseCase';
import { CancelBetUseCase } from '@core/betting/aplication/use-cases/CancelBetUseCase';
import { GetUserBetsUseCase } from '@core/betting/aplication/use-cases/GetUserBetsUseCase';
import { GetEventBetsUseCase } from '@core/betting/aplication/use-cases/GetEventUseCase';

export async function createBetRoutes(): Promise<Router> {
  const router = Router();

  const betRepository = await createBetRepository();
  const eventRepository = await createEventRepository();
  const walletRepository = await createWalletRepository();
  const walletService = new WalletService(walletRepository as any);

  const betService = new BetService(betRepository as any, eventRepository as any, walletService);

  // use-cases (thin wrappers / orchestration)
  const placeBetUseCase = new PlaceBetUseCase(betService);
  const cancelBetUseCase = new CancelBetUseCase(betService);
  const getUserBetsUseCase = new GetUserBetsUseCase(betService);
  const getEventBetsUseCase = new GetEventBetsUseCase(betService);

  const betController = new BetController(placeBetUseCase, cancelBetUseCase, getUserBetsUseCase, getEventBetsUseCase);

  router.get('/event/:eventId', asyncHandler((req, res) => betController.getEventBets(req, res)));
  router.post('/', protectedRoute, asyncHandler((req, res) => betController.placeBet(req, res)));
  router.post('/:betId/cancel', protectedRoute, asyncHandler((req, res) => betController.cancelBet(req, res)));
  router.get('/me', protectedRoute, asyncHandler((req, res) => betController.getMyBets(req, res)));

  return router;
}
