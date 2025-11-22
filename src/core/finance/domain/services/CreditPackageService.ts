import { AppError } from '@/shared/errors/AppError';
import { CreditPackage } from '../entities/CreditPackage';
import { ICreditPackageRepository } from '../repositories/ICreditPackageRepository';

export class CreditPackageService {
  constructor(private readonly creditPackageRepository: ICreditPackageRepository) {}

  async listActive(): Promise<CreditPackage[]> {
    return this.creditPackageRepository.listActive();
  }

  async getById(id: string): Promise<CreditPackage> {
    const creditPackage = await this.creditPackageRepository.findById(id);
    if (!creditPackage) {
      throw new AppError('NOT_FOUND', 'Pacote de créditos não encontrado', 404);
    }
    return creditPackage;
  }

  async create(creditPackage: CreditPackage): Promise<CreditPackage> {
    return this.creditPackageRepository.save(creditPackage);
  }
}
