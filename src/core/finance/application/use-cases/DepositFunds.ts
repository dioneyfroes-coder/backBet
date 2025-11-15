import { WalletService } from '@/core/finance/domain/services/WalletService';
import { IWalletDTO } from '@/core/finance/types/wallet.types';
import { AppError } from '@/shared/errors/AppError';

export class DepositFunds {
  constructor(private walletService: WalletService) {}

  async execute(userId: string, amount: number): Promise<IWalletDTO> {
    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Amount must be positive', 400);
    }

    const wallet = await this.walletService.deposit(userId, amount);
    return wallet.toDTO();
  }
}
