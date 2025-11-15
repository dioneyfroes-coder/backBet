import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AuthController } from '../controllers/AuthController';
import { RegisterUser } from '@core/user/application/use-cases/RegisterUser';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { UserService } from '../../../core/user/domain/services/UserService';
import { WalletService } from '../../../core/finance/domain/services/WalletService';
import { UserRepository } from '../../../core/user/domain/repositories/UserRepository';
import { WalletRepository } from '../../../core/finance/domain/repositories/WalletRepository';

export function createAuthRoutes(): Router {
  const router = Router();

  // Instanciar repositórios (em memória por enquanto)
  const userRepository = new UserRepository();
  const walletRepository = new WalletRepository();

  // Instanciar serviços
  const userService = new UserService(userRepository);
  const walletService = new WalletService(walletRepository);

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
