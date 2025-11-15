import { WalletService } from '../../domain/services/WalletService';

export class GetWallet {
  constructor(private walletService: WalletService) {}

  async execute(userId: string) {
    return this.walletService.findByUserId(userId);
  }
}
