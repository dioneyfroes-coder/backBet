import { UserService } from '@/core/user/domain/services/UserService';

export class GetPreferences {
  constructor(private readonly userService: UserService) {}

  async execute(userId: string) {
    return this.userService.getPreferences(userId);
  }
}
