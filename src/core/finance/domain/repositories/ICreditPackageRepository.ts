import { CreditPackage } from '../entities/CreditPackage';

export interface ICreditPackageRepository {
  listActive(): Promise<CreditPackage[]>;
  findById(id: string): Promise<CreditPackage | null>;
  save(creditPackage: CreditPackage): Promise<CreditPackage>;
}
