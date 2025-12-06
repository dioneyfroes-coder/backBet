import { WalletService } from '@/core/finance/domain/services/WalletService';
import { IWalletDTO } from '@/core/finance/types/wallet.types';
import { executeWithWalletErrorMapping } from '@/core/finance/application/errors/WalletErrorMapper';
import { TransactionContext } from '@/core/finance/domain/entities/Wallet';

export class DepositFunds {
  constructor(private walletService: WalletService) {}

  async execute(userId: string, amount: number, context?: TransactionContext): Promise<IWalletDTO> {
    const wallet = await executeWithWalletErrorMapping(() =>
      this.walletService.deposit(userId, amount, context),
    );
    return wallet.toDTO();
  }
}
