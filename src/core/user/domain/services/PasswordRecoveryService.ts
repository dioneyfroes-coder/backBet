import { IUserRepository } from '@core/user/domain/repositories/IUserRepository';
import { AppError } from '@core/errors/AppError';
import { Email } from '@core/user/domain/value-objects/Email';
import crypto from 'crypto';

export class PasswordRecoveryService {
  constructor(private userRepository: IUserRepository) {}

  async requestRecovery(email: string): Promise<string> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      // Não revela se o email existe ou não
      await new Promise((resolve) => setTimeout(resolve, 100)); // delay mínimo para evitar timing attacks
      return '';
    }
    const token = crypto.randomBytes(32).toString('hex');
    user.passwordRecovery = {
      token,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 minutos
    };
    await this.userRepository.update(user);
    return token;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findByRecoveryToken(token);
    if (!user || !user.passwordRecovery || user.passwordRecovery.token !== token)
      throw new AppError('NOT_FOUND', 'Token inválido', 404);
    if (user.passwordRecovery.expiresAt < new Date())
      throw new AppError('BAD_REQUEST', 'Token expirado', 400);
    user.setPassword(newPassword);
    user.passwordRecovery = undefined;
    await this.userRepository.update(user);
  }
}
