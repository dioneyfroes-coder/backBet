import { WalletService } from '../../domain/services/WalletService';

export class Deposit {
  constructor(private walletService: WalletService) {}

  async execute(userId: string, amount: number) {
    return this.walletService.deposit(userId, amount);
  }
}
