import { Router } from 'express';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { WalletController } from '../controllers/WalletController';
import { WalletService } from '../../../core/finance/domain/services/WalletService';
import { WalletRepository } from '../../../core/finance/domain/repositories/WalletRepository';

/**
 * Factory para criar rotas de carteira com injeção de dependências
 */
export function createWalletRoutes(): Router {
  const router = Router();

  // Injeção de dependências
  const walletRepository = new WalletRepository();
  const walletService = new WalletService(walletRepository);
  const walletController = new WalletController(walletService);

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
