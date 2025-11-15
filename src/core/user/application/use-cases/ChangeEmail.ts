import { UserService } from '../../domain/services/UserService';

export class ChangeEmail {
  constructor(private userService: UserService) {}

  async execute(userId: string, newEmail: string): Promise<void> {
    await this.userService.changeEmail(userId, newEmail);
  }
}
