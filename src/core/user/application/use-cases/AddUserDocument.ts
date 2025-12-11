import { UserService } from '@core/user/domain/services/UserService';

export class AddUserDocument {
  constructor(private userService: UserService) {}

  async execute(
    userId: string,
    document: {
      id: string;
      type?: string | null;
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
      url: string;
      uploadedAt: string;
      verified?: boolean;
    },
  ): Promise<void> {
    await this.userService.addDocument(userId, document);
  }
}
