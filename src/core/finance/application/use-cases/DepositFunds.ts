import { WalletService } from "@/core/finance/domain/services/WalletService";
import { IWalletDTO } from "@/core/finance/types/wallet.types";

export class DepositFunds {
  constructor(
    private walletService: WalletService,
  ) {}

  async execute(userId: string, amount: number): Promise<IWalletDTO> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const wallet = await this.walletService.deposit(userId, amount);
    return wallet.toDTO();
  }
}