import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AuthController } from '../controllers/AuthController';
import { RegisterUser } from '@core/user/application/use-cases/RegisterUser';
import { AuthenticatedRequest, protectedRoute } from '../middleware/AuthMiddleware';
import { UserService } from '../../../core/user/domain/services/UserService';
import { WalletService } from '../../../core/finance/domain/services/WalletService';
import {
  createUserRepository,
  createWalletRepository,
  createLedgerRepository,
} from '@/infrastructure/persistence/factory';
import { IUserRepository } from '@/core/user/domain/repositories/IUserRepository';
import { IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';
import { ILedgerRepository } from '@/core/finance/domain/repositories/ILedgerRepository';
import { JwtService } from '@/shared/services/JwtService';
import { createRouteRateLimiter } from '../middleware/routeRateLimiter';
import { appConfig } from '@/shared/config/appConfig';

export type AuthRoutesDeps = {
  userRepository?: IUserRepository;
  walletRepository?: IWalletRepository;
  ledgerRepository?: ILedgerRepository;
  jwtService?: JwtService;
};

export async function createAuthRoutes(deps: AuthRoutesDeps = {}): Promise<Router> {
  const router = Router();
  const registerLimiter = createRouteRateLimiter({
    ...appConfig.authRateLimit.register,
    keyPrefix: 'auth-register',
  });

  const loginLimiter = createRouteRateLimiter({
    ...appConfig.authRateLimit.login,
    keyPrefix: 'auth-login',
  });

  const refreshLimiter = createRouteRateLimiter({
    ...appConfig.authRateLimit.refresh,
    keyPrefix: 'auth-refresh',
  });

  // Instanciar repositórios via factory
  const userRepository: IUserRepository = deps.userRepository ?? (await createUserRepository());
  const walletRepository: IWalletRepository =
    deps.walletRepository ?? (await createWalletRepository());
  const ledgerRepository: ILedgerRepository =
    deps.ledgerRepository ?? (await createLedgerRepository());

  // Instanciar serviços
  const userService = new UserService(userRepository);
  const walletService = new WalletService(walletRepository, ledgerRepository);
  const jwtService = deps.jwtService ?? new JwtService();

  // Use-cases
  const registerUserUseCase = new RegisterUser(userService, walletService);

  // Instanciar controller
  const authController = new AuthController(registerUserUseCase, userService, jwtService);

  /**
   * POST /auth/register
   * Registra novo usuário
   */
  router.post(
    '/register',
    registerLimiter,
    asyncHandler((req: Request, res: Response) => authController.register(req, res)),
  );

  router.get(
    '/register/status/:userId',
    asyncHandler((req: Request<{ userId: string }>, res: Response) =>
      authController.registrationStatus(req, res),
    ),
  );

  /**
   * POST /auth/login
   * Autentica usuário (via provedor de identidade ou credenciais locais)
   */
  router.post(
    '/login',
    loginLimiter,
    asyncHandler((req: Request, res: Response) => authController.login(req, res)),
  );

  /**
   * GET /auth/me
   * Retorna dados do usuário autenticado
   */
  router.get(
    '/me',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res: Response) => authController.me(req, res)),
  );

  /**
   * POST /auth/refresh
   * Renova access token
   */
  router.post(
    '/refresh',
    refreshLimiter,
    asyncHandler((req: Request, res: Response) => authController.refreshToken(req, res)),
  );

  /**
   * POST /auth/logout
   * Faz logout
   */
  router.post(
    '/logout',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res: Response) => authController.logout(req, res)),
  );

  return router;
}
