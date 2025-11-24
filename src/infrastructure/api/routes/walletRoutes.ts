import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  cacheWalletBalanceMiddleware,
  cacheWalletHistoryMiddleware,
} from '../middleware/cacheMiddleware';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { createRouteRateLimiter } from '../middleware/routeRateLimiter';
import { WalletController } from '../controllers/WalletController';
import { WalletService } from '@core/finance/domain/services/WalletService';
import { createWalletRepository } from '@/infrastructure/persistence/factory';
import { GetWallet } from '@core/finance/application/use-cases/GetWallet';
import { Deposit } from '@core/finance/application/use-cases/Deposit';
import { Withdraw } from '@core/finance/application/use-cases/Withdraw';
import { GetHistory } from '@core/finance/application/use-cases/GetHistory';
import { IWalletRepository } from '@core/finance/domain/repositories/IWalletRepository';
import { appConfig } from '@/shared/config/appConfig';

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
    withdrawUseCase,
    getHistoryUseCase,
  );

  const depositLimiter = createRouteRateLimiter({
    ...appConfig.walletRateLimit.deposit,
    keyPrefix: 'wallet-deposit',
  });

  const withdrawLimiter = createRouteRateLimiter({
    ...appConfig.walletRateLimit.withdraw,
    keyPrefix: 'wallet-withdraw',
  });

  // Rotas protegidas
  router.get(
    '/me',
    protectedRoute,
    cacheWalletBalanceMiddleware,
    asyncHandler((req, res) => walletController.getMe(req, res)),
  );

  router.post(
    '/deposit',
    protectedRoute,
    depositLimiter,
    asyncHandler((req, res) => walletController.deposit(req, res)),
  );

  router.post(
    '/withdraw',
    protectedRoute,
    withdrawLimiter,
    asyncHandler((req, res) => walletController.withdraw(req, res)),
  );

  router.get(
    '/history',
    protectedRoute,
    cacheWalletHistoryMiddleware,
    asyncHandler((req, res) => walletController.getHistory(req, res)),
  );

  return router;
}
