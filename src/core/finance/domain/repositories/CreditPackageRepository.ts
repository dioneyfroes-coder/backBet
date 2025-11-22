import { CreditPackage } from '../entities/CreditPackage';
import { ICreditPackageRepository } from './ICreditPackageRepository';

export class CreditPackageRepository implements ICreditPackageRepository {
  private packages: CreditPackage[] = [];

  async listActive(): Promise<CreditPackage[]> {
    return this.packages.filter((pkg) => pkg.isActive);
  }

  async findById(id: string): Promise<CreditPackage | null> {
    return this.packages.find((pkg) => pkg.id === id) || null;
  }

  async save(creditPackage: CreditPackage): Promise<CreditPackage> {
    const index = this.packages.findIndex((pkg) => pkg.id === creditPackage.id);
    if (index >= 0) {
      this.packages[index] = creditPackage;
      return creditPackage;
    }
    this.packages.push(creditPackage);
    return creditPackage;
  }
}
