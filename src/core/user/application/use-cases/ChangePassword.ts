import { IUserRepository } from '@core/user/domain/repositories/IUserRepository';
import { AppError } from '@/shared/errors/AppError';
import bcrypt from 'bcryptjs';
import { getSessionService } from '@/core/auth/domain/services/SessionServiceSingleton';

export type ChangePasswordInput = {
  userId: string;
  currentPassword: string;
  newPassword: string;
};

export class ChangePassword {
  constructor(private userRepository: IUserRepository) {}

  async execute({ userId, currentPassword, newPassword }: ChangePasswordInput): Promise<void> {
    if (!newPassword || newPassword.length < 8) {
      throw new AppError('BAD_REQUEST', 'Senha deve ter pelo menos 8 caracteres', 400);
    }
    if (currentPassword === newPassword) {
      throw new AppError('BAD_REQUEST', 'A nova senha deve ser diferente da senha atual', 400);
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('NOT_FOUND', 'Usuário não encontrado', 404);
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError('FORBIDDEN', 'Conta suspensa. Entre em contato com o suporte.', 403);
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash || '');
    if (!valid) {
      throw new AppError('UNAUTHORIZED', 'Senha atual incorreta', 401);
    }

    user.setPassword(newPassword);
    await this.userRepository.update(user);

    // Mudança de senha revoga todas as sessões ativas (Fase 9).
    const sessionService = await getSessionService();
    await sessionService.revokeAllForUser(userId);
  }
}