import { IUserRepository } from '@core/user/domain/repositories/IUserRepository';
import { PasswordRecoveryService } from '@core/user/domain/services/PasswordRecoveryService';

export class ResetPassword {
  constructor(private userRepository: IUserRepository) {}

  async execute(token: string, newPassword: string): Promise<void> {
    const recoveryService = new PasswordRecoveryService(this.userRepository);
    await recoveryService.resetPassword(token, newPassword);
  }
}
