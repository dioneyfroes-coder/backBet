import { UserService } from '../../domain/services/UserService';

export class UpdatePixKey {
  constructor(private readonly userService: UserService) {}

  async execute(userId: string, pixKey: string | null): Promise<void> {
    await this.userService.updatePixKey(userId, pixKey);
  }
}
