import { Request, Response } from 'express';
import { IUserRepository } from '@core/user/domain/repositories/IUserRepository';
import { RequestPasswordRecovery } from '@core/user/application/use-cases/RequestPasswordRecovery';
import { ResetPassword } from '@core/user/application/use-cases/ResetPassword';

export class PasswordRecoveryController {
  constructor(private userRepository: IUserRepository) {}

  async requestRecovery(req: Request, res: Response) {
    const { email } = req.body;
    const useCase = new RequestPasswordRecovery(this.userRepository);
    await useCase.execute(email);
    res.status(200).json({ message: 'Se o email existir, um link de recuperação foi enviado.' });
  }

  async resetPassword(req: Request, res: Response) {
    const { token, newPassword } = req.body;
    const useCase = new ResetPassword(this.userRepository);
    await useCase.execute(token, newPassword);
    res.status(200).json({ message: 'Senha redefinida com sucesso.' });
  }
}
