import { Router } from 'express';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { WalletController } from '../controllers/WalletController';
import { WalletService } from '@core/finance/domain/services/WalletService';
import { WalletRepository } from '@core/finance/domain/repositories/WalletRepository';
import { GetWallet } from '@core/finance/application/use-cases/GetWallet';
import { Deposit } from '@core/finance/application/use-cases/Deposit';
import { Withdraw } from '@core/finance/application/use-cases/Withdraw';
import { GetHistory } from '@core/finance/application/use-cases/GetHistory';

/**
 * Factory para criar rotas de carteira com injeção de dependências
 */
export function createWalletRoutes(): Router {
  const router = Router();

  // Injeção de dependências
  const walletRepository = new WalletRepository();
  const walletService = new WalletService(walletRepository);

  // Use-cases
  const getWalletUseCase = new GetWallet(walletService);
  const depositUseCase = new Deposit(walletService);
  const withdrawUseCase = new Withdraw(walletService);
  const getHistoryUseCase = new GetHistory(walletService);

  const walletController = new WalletController(
    getWalletUseCase,
    depositUseCase,
    withdrawUseCase
    ,getHistoryUseCase
  );

  // Rotas protegidas
  router.get('/me', protectedRoute, (req, res) =>
    walletController.getMe(req, res)
  );

  router.post('/deposit', protectedRoute, (req, res) =>
    walletController.deposit(req, res)
  );

  router.post('/withdraw', protectedRoute, (req, res) =>
    walletController.withdraw(req, res)
  );

  router.get('/history', protectedRoute, (req, res) =>
    walletController.getHistory(req, res)
  );

  return router;
}
