import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { WalletController } from '../controllers/WalletController';
import { WalletService } from '@core/finance/domain/services/WalletService';
import { createWalletRepository } from '@/infrastructure/persistence/factory';
import { GetWallet } from '@core/finance/application/use-cases/GetWallet';
import { Deposit } from '@core/finance/application/use-cases/Deposit';
import { Withdraw } from '@core/finance/application/use-cases/Withdraw';
import { GetHistory } from '@core/finance/application/use-cases/GetHistory';
import { IWalletRepository } from '@core/finance/domain/repositories/IWalletRepository';

/**
 * Factory para criar rotas de carteira com injeção de dependências
 */
export type WalletRoutesDeps = {
  walletRepository?: IWalletRepository;
};

export async function createWalletRoutes(deps: WalletRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const walletRepository = deps.walletRepository ?? (await createWalletRepository());
  const walletService = new WalletService(walletRepository as any);

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
  router.get('/me', protectedRoute, asyncHandler((req, res) => walletController.getMe(req, res)));

  router.post('/deposit', protectedRoute, asyncHandler((req, res) => walletController.deposit(req, res)));

  router.post('/withdraw', protectedRoute, asyncHandler((req, res) => walletController.withdraw(req, res)));

  router.get('/history', protectedRoute, asyncHandler((req, res) => walletController.getHistory(req, res)));

  return router;
}
