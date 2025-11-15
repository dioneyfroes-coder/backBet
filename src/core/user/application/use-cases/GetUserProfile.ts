import { UserService } from '../../domain/services/UserService';

export class GetUserProfile {
  constructor(private userService: UserService) {}

  async execute(userId: string) {
    return this.userService.findById(userId);
  }
}
