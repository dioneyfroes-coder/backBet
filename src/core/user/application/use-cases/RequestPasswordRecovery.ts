import { IUserRepository } from '@core/user/domain/repositories/IUserRepository';
import { PasswordRecoveryService } from '@core/user/domain/services/PasswordRecoveryService';
import { processContactPayload } from '@/infrastructure/mailer/ContactWorker';

export class RequestPasswordRecovery {
  constructor(private userRepository: IUserRepository) {}

  async execute(email: string): Promise<void> {
    const recoveryService = new PasswordRecoveryService(this.userRepository);
    const token = await recoveryService.requestRecovery(email);
    // Envia email com link de recuperação
    await processContactPayload({
      ticketId: `recover-password-${email}`,
      name: email,
      email,
      message: `Use o link para redefinir sua senha: https://seusite.com/reset-password?token=${token}`,
      createdAt: new Date().toISOString(),
    });
  }
}
