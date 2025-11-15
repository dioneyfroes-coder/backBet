import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { UserController } from '../controllers/UserController';
import { UserService } from '@core/user/domain/services/UserService';
import { UserRepository } from '@core/user/domain/repositories/UserRepository';
import { GetUserProfile } from '@core/user/application/use-cases/GetUserProfile';
import { UpdateProfile } from '@core/user/application/use-cases/UpdateProfile';
import { ChangeEmail } from '@core/user/application/use-cases/ChangeEmail';

/**
 * Factory para criar rotas de usuário com injeção de dependências
 */
export function createUserRoutes(): Router {
  const router = Router();

  // Injeção de dependências
  const userRepository = new UserRepository();
  const userService = new UserService(userRepository);

  // Use-cases
  const getUserProfileUseCase = new GetUserProfile(userService);
  const updateProfileUseCase = new UpdateProfile(userService);
  const changeEmailUseCase = new ChangeEmail(userService);

  const userController = new UserController(
    getUserProfileUseCase,
    updateProfileUseCase,
    changeEmailUseCase
  );

  // Rotas protegidas
  router.get('/me', protectedRoute, asyncHandler((req, res) => userController.getMe(req, res)));

  router.patch('/me', protectedRoute, asyncHandler((req, res) => userController.updateProfile(req, res)));

  router.patch('/me/email', protectedRoute, asyncHandler((req, res) => userController.changeEmail(req, res)));

  return router;
}
