import { CreditPackageService } from '@/core/finance/domain/services/CreditPackageService';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { executeWithWalletErrorMapping } from '@/core/finance/application/errors/WalletErrorMapper';
import { IdempotencyService } from '@/shared/services/IdempotencyService';
import { CreditPackage } from '@/core/finance/domain/entities/CreditPackage';
import { Wallet } from '@/core/finance/domain/entities/Wallet';

export class PurchaseCreditPackage {
  constructor(
    private creditPackageService: CreditPackageService,
    private walletService: WalletService,
    private idempotency?: IdempotencyService,
  ) {}

  async execute(userId: string, packageId: string, idempotencyKey?: string) {
    const operation = () => executeWithWalletErrorMapping(async () => {
      const creditPackage = await this.creditPackageService.getById(packageId);
      const wallet = await this.walletService.deposit(userId, creditPackage.totalCredits);
      return {
        creditPackage,
        wallet,
      };
    });
    if (!this.idempotency || !idempotencyKey) {
      return operation();
    }
    return this.idempotency.execute(
      `${userId}:package-purchase:${idempotencyKey}`,
      JSON.stringify({ userId, packageId }),
      operation,
      (raw) => ({
        creditPackage: new CreditPackage(
          raw.creditPackage.id,
          raw.creditPackage.code,
          raw.creditPackage.label,
          raw.creditPackage.baseAmount,
          raw.creditPackage.bonusAmount,
          raw.creditPackage.currency,
          raw.creditPackage.price,
          raw.creditPackage.description,
          raw.creditPackage.isActive,
          new Date(raw.creditPackage.createdAt),
          new Date(raw.creditPackage.updatedAt),
        ),
        wallet: new Wallet(raw.wallet.userId, raw.wallet.currency),
      }),
    );
  }
}
