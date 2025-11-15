import { Router } from 'express';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { BetController } from '../controllers/BetController';
import { BetService } from '@core/betting/domain/services/BetService';
import { BetRepository } from '@core/betting/domain/repositories/BetRepository';
import { EventRepository } from '@core/betting/domain/repositories/EventRepository';
import { WalletRepository } from '@core/finance/domain/repositories/WalletRepository';
import { WalletService } from '@core/finance/domain/services/WalletService';
import { PlaceBetUseCase } from '@core/betting/aplication/use-cases/PlaceBetUseCase';
import { CancelBetUseCase } from '@core/betting/aplication/use-cases/CancelBetUseCase';
import { GetUserBetsUseCase } from '@core/betting/aplication/use-cases/GetUserBetsUseCase';
import { GetEventBetsUseCase } from '@core/betting/aplication/use-cases/GetEventUseCase';

export function createBetRoutes(): Router {
  const router = Router();

  const betRepository = new BetRepository();
  const eventRepository = new EventRepository();
  const walletRepository = new WalletRepository();
  const walletService = new WalletService(walletRepository);

  const betService = new BetService(betRepository, eventRepository, walletService);

  // use-cases (thin wrappers / orchestration)
  const placeBetUseCase = new PlaceBetUseCase(betService);
  const cancelBetUseCase = new CancelBetUseCase(betService);
  const getUserBetsUseCase = new GetUserBetsUseCase(betService);
  const getEventBetsUseCase = new GetEventBetsUseCase(betService);

  const betController = new BetController(placeBetUseCase, cancelBetUseCase, getUserBetsUseCase, getEventBetsUseCase);

  router.get('/event/:eventId', (req, res) => betController.getEventBets(req, res));
  router.post('/', protectedRoute, (req, res) => betController.placeBet(req, res));
  router.post('/:betId/cancel', protectedRoute, (req, res) => betController.cancelBet(req, res));
  router.get('/me', protectedRoute, (req, res) => betController.getMyBets(req, res));

  return router;
}
