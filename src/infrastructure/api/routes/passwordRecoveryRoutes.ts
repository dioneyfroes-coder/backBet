import { Router } from 'express';
import { PasswordRecoveryController } from '../controllers/PasswordRecoveryController';
import { IUserRepository } from '@core/user/domain/repositories/IUserRepository';

export function createPasswordRecoveryRoutes({
  userRepository,
}: {
  userRepository: IUserRepository;
}) {
  const router = Router();
  const controller = new PasswordRecoveryController(userRepository);
  router.post('/request-password-recovery', (req, res) => controller.requestRecovery(req, res));
  router.post('/reset-password', (req, res) => controller.resetPassword(req, res));
  return router;
}
