import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  cacheWalletBalanceMiddleware,
  cacheWalletHistoryMiddleware,
} from '../middleware/cacheMiddleware';
import { AuthenticatedRequest, protectedRoute } from '../middleware/AuthMiddleware';
import { createRouteRateLimiter } from '../middleware/routeRateLimiter';
import { WalletController } from '../controllers/WalletController';
import { WalletService } from '@core/finance/domain/services/WalletService';
import { createWalletRepository, createUserRepository } from '@/infrastructure/persistence/factory';
import { GetWallet } from '@core/finance/application/use-cases/GetWallet';
import { Deposit } from '@core/finance/application/use-cases/Deposit';
import { Withdraw } from '@core/finance/application/use-cases/Withdraw';
import { GetHistory } from '@core/finance/application/use-cases/GetHistory';
import { IWalletRepository } from '@core/finance/domain/repositories/IWalletRepository';
import { appConfig } from '@/shared/config/appConfig';
import { createPixProvider } from '@/infrastructure/payments/pix';
import { PixProviderPort } from '@/core/finance/domain/ports/PixProviderPort';
import { UserService } from '@core/user/domain/services/UserService';
import { IUserRepository } from '@core/user/domain/repositories/IUserRepository';
import { idempotencyService } from '@/shared/services/IdempotencyService';

/**
 * Factory para criar rotas de carteira com injeção de dependências
 */
export type WalletRoutesDeps = {
  walletRepository?: IWalletRepository;
  pixProvider?: PixProviderPort;
  userRepository?: IUserRepository;
};

export async function createWalletRoutes(deps: WalletRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const walletRepository: IWalletRepository =
    deps.walletRepository ?? (await createWalletRepository());
  const walletService = new WalletService(walletRepository);
  const pixProvider: PixProviderPort = deps.pixProvider ?? (await createPixProvider());
  const userRepository: IUserRepository = deps.userRepository ?? (await createUserRepository());
  const userService = new UserService(userRepository);

  // Use-cases
  const getWalletUseCase = new GetWallet(walletService);
  const depositUseCase = new Deposit(walletService, pixProvider, idempotencyService);
  const withdrawUseCase = new Withdraw(walletService, pixProvider, idempotencyService);
  const getHistoryUseCase = new GetHistory(walletService);

  const walletController = new WalletController(
    getWalletUseCase,
    depositUseCase,
    withdrawUseCase,
    getHistoryUseCase,
    userService,
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
    asyncHandler((req: AuthenticatedRequest, res) => walletController.getMe(req, res)),
  );

  router.post(
    '/deposit',
    protectedRoute,
    depositLimiter,
    asyncHandler((req: AuthenticatedRequest, res) => walletController.deposit(req, res)),
  );

  router.post(
    '/withdraw',
    protectedRoute,
    withdrawLimiter,
    asyncHandler((req: AuthenticatedRequest, res) => walletController.withdraw(req, res)),
  );

  router.get(
    '/history',
    protectedRoute,
    cacheWalletHistoryMiddleware,
    asyncHandler((req: AuthenticatedRequest, res) => walletController.getHistory(req, res)),
  );

  return router;
}
