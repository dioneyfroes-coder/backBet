import { CreditPackageService } from '@/core/finance/domain/services/CreditPackageService';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { executeWithWalletErrorMapping } from '@/core/finance/application/errors/WalletErrorMapper';

export class PurchaseCreditPackage {
  constructor(
    private creditPackageService: CreditPackageService,
    private walletService: WalletService,
  ) {}

  async execute(userId: string, packageId: string) {
    return executeWithWalletErrorMapping(async () => {
      const creditPackage = await this.creditPackageService.getById(packageId);
      const wallet = await this.walletService.deposit(userId, creditPackage.totalCredits);
      return {
        creditPackage,
        wallet,
      };
    });
  }
}
