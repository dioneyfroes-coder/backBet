import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AuthenticatedRequest, protectedRoute } from '../middleware/AuthMiddleware';
import { cacheUserProfileMiddleware } from '../middleware/cacheMiddleware';
import { UserController } from '../controllers/UserController';
import { UserService } from '@core/user/domain/services/UserService';
import { createUserRepository } from '@/infrastructure/persistence/factory';
import { GetUserProfile } from '@core/user/application/use-cases/GetUserProfile';
import { UpdateProfile } from '@core/user/application/use-cases/UpdateProfile';
import { ChangeEmail } from '@core/user/application/use-cases/ChangeEmail';
import { UpdatePixKey } from '@core/user/application/use-cases/UpdatePixKey';
import { IUserRepository } from '@core/user/domain/repositories/IUserRepository';

/**
 * Factory para criar rotas de usuário com injeção de dependências
 */
export type UserRoutesDeps = {
  userRepository?: IUserRepository;
};

export async function createUserRoutes(deps: UserRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const userRepository: IUserRepository = deps.userRepository ?? (await createUserRepository());
  const userService = new UserService(userRepository);

  // Use-cases
  const getUserProfileUseCase = new GetUserProfile(userService);
  const updateProfileUseCase = new UpdateProfile(userService);
  const changeEmailUseCase = new ChangeEmail(userService);
  const updatePixKeyUseCase = new UpdatePixKey(userService);

  const userController = new UserController(
    getUserProfileUseCase,
    updateProfileUseCase,
    changeEmailUseCase,
    updatePixKeyUseCase,
  );

  // Rotas protegidas
  router.get(
    '/me',
    protectedRoute,
    cacheUserProfileMiddleware,
    asyncHandler((req: AuthenticatedRequest, res) => userController.getMe(req, res)),
  );

  router.patch(
    '/me',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res) => userController.updateProfile(req, res)),
  );

  router.patch(
    '/me/email',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res) => userController.changeEmail(req, res)),
  );

  router.get(
    '/me/pix-key',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res: Response) => userController.getPixKey(req, res)),
  );

  router.put(
    '/me/pix-key',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res: Response) => userController.updatePixKey(req, res)),
  );

  return router;
}
