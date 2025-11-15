import { UserService } from '../../domain/services/UserService';

export class UpdateProfile {
  constructor(private userService: UserService) {}

  async execute(userId: string, data: { username?: string }): Promise<void> {
    await this.userService.updateProfile(userId, { username: data.username || '' });
  }
}
