import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AuthController } from '../controllers/AuthController';
import { RegisterUser } from '@core/user/application/use-cases/RegisterUser';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { UserService } from '../../../core/user/domain/services/UserService';
import { WalletService } from '../../../core/finance/domain/services/WalletService';
import { createUserRepository, createWalletRepository } from '@/infrastructure/persistence/factory';

export async function createAuthRoutes(): Promise<Router> {
  const router = Router();

  // Instanciar repositórios via factory
  const userRepository = await createUserRepository();
  const walletRepository = await createWalletRepository();

  // Instanciar serviços
  const userService = new UserService(userRepository as any);
  const walletService = new WalletService(walletRepository as any);

  // Use-cases
  const registerUserUseCase = new RegisterUser(userService, walletService);

  // Instanciar controller
  const authController = new AuthController(registerUserUseCase, userService);

  /**
   * POST /auth/register
   * Registra novo usuário
   */
  router.post('/register', asyncHandler((req: Request, res: Response) => authController.register(req, res)));

  /**
   * POST /auth/login
   * Autentica usuário (via Clerk OAuth)
   */
  router.post('/login', asyncHandler((req: Request, res: Response) => authController.login(req, res)));

  /**
   * GET /auth/me
   * Retorna dados do usuário autenticado
   */
  router.get('/me', protectedRoute, asyncHandler((req: Request, res: Response) => authController.me(req as any, res)));

  /**
   * POST /auth/refresh
   * Renova access token
   */
  router.post('/refresh', asyncHandler((req: Request, res: Response) => authController.refreshToken(req, res)));

  /**
   * POST /auth/logout
   * Faz logout
   */
  router.post('/logout', protectedRoute, asyncHandler((req: Request, res: Response) => authController.logout(req as any, res)));

  return router;
}
