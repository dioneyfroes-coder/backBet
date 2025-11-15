import { WalletService } from '../../domain/services/WalletService';

export class Withdraw {
  constructor(private walletService: WalletService) {}

  async execute(userId: string, amount: number) {
    return this.walletService.withdraw(userId, amount);
  }
}
