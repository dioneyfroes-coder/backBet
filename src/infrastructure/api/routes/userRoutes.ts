import { Router } from 'express';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { UserController } from '../controllers/UserController';
import { UserService } from '../../../core/user/domain/services/UserService';
import { UserRepository } from '../../../core/user/domain/repositories/UserRepository';

/**
 * Factory para criar rotas de usuário com injeção de dependências
 */
export function createUserRoutes(): Router {
  const router = Router();

  // Injeção de dependências
  const userRepository = new UserRepository();
  const userService = new UserService(userRepository);
  const userController = new UserController(userService);

  // Rotas protegidas
  router.get('/me', protectedRoute, (req, res) =>
    userController.getMe(req, res)
  );

  router.patch('/me', protectedRoute, (req, res) =>
    userController.updateProfile(req, res)
  );

  router.patch('/me/email', protectedRoute, (req, res) =>
    userController.changeEmail(req, res)
  );

  return router;
}
