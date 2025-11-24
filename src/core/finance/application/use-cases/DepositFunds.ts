import { WalletService } from '@/core/finance/domain/services/WalletService';
import { IWalletDTO } from '@/core/finance/types/wallet.types';
import { executeWithWalletErrorMapping } from '@/core/finance/application/errors/WalletErrorMapper';

export class DepositFunds {
  constructor(private walletService: WalletService) {}

  async execute(userId: string, amount: number): Promise<IWalletDTO> {
    const wallet = await executeWithWalletErrorMapping(() =>
      this.walletService.deposit(userId, amount),
    );
    return wallet.toDTO();
  }
}
