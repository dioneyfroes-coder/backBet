import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { UserController } from '../controllers/UserController';
import { UserService } from '@core/user/domain/services/UserService';
import { createUserRepository } from '@/infrastructure/persistence/factory';
import { GetUserProfile } from '@core/user/application/use-cases/GetUserProfile';
import { UpdateProfile } from '@core/user/application/use-cases/UpdateProfile';
import { ChangeEmail } from '@core/user/application/use-cases/ChangeEmail';
import { IUserRepository } from '@core/user/domain/repositories/IUserRepository';

/**
 * Factory para criar rotas de usuário com injeção de dependências
 */
export type UserRoutesDeps = {
  userRepository?: IUserRepository;
};

export async function createUserRoutes(deps: UserRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const userRepository = deps.userRepository ?? (await createUserRepository());
  const userService = new UserService(userRepository as any);

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
