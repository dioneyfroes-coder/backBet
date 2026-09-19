import { IUserRepository } from '@core/user/domain/repositories/IUserRepository';
import { PasswordRecoveryService } from '@core/user/domain/services/PasswordRecoveryService';
import { getSessionService } from '@/core/auth/domain/services/SessionServiceSingleton';

export class ResetPassword {
  constructor(private userRepository: IUserRepository) {}

  async execute(token: string, newPassword: string): Promise<void> {
    const recoveryService = new PasswordRecoveryService(this.userRepository);
    const userId = await recoveryService.resetPassword(token, newPassword);
    // Redefinição de senha invalida todas as sessões ativas (Fase 9).
    const sessionService = await getSessionService();
    await sessionService.revokeAllForUser(userId);
  }
}