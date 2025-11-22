import { CreditPackageService } from '@/core/finance/domain/services/CreditPackageService';
import { CreditPackage } from '@/core/finance/domain/entities/CreditPackage';

export class ListCreditPackages {
  constructor(private creditPackageService: CreditPackageService) {}

  async execute(): Promise<CreditPackage[]> {
    return this.creditPackageService.listActive();
  }
}
