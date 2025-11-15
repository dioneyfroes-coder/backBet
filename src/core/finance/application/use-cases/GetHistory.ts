import { WalletService } from '../../domain/services/WalletService';

export class GetHistory {
  constructor(private walletService: WalletService) {}

  async execute(userId: string, limit = 10, offset = 0) {
    return this.walletService.getHistory(userId, limit, offset);
  }
}
