import { CreditPackageService } from '@/core/finance/domain/services/CreditPackageService';
import { WalletService } from '@/core/finance/domain/services/WalletService';

export class PurchaseCreditPackage {
  constructor(
    private creditPackageService: CreditPackageService,
    private walletService: WalletService,
  ) {}

  async execute(userId: string, packageId: string) {
    const creditPackage = await this.creditPackageService.getById(packageId);
    const wallet = await this.walletService.deposit(userId, creditPackage.totalCredits);
    return {
      creditPackage,
      wallet,
    };
  }
}
