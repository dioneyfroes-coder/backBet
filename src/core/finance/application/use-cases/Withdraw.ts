import { WalletService } from '../../domain/services/WalletService';
import { executeWithWalletErrorMapping } from '../errors/WalletErrorMapper';

export class Withdraw {
  constructor(private walletService: WalletService) {}

  async execute(userId: string, amount: number) {
    return executeWithWalletErrorMapping(() => this.walletService.withdraw(userId, amount));
  }
}
