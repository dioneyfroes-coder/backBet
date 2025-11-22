import { CreditPackage } from '@/core/finance/domain/entities/CreditPackage';
import { ICreditPackageRepository } from '@/core/finance/domain/repositories/ICreditPackageRepository';
import { CreditPackageModel, ICreditPackageDocument } from '../schemas/CreditPackageSchema';

export class MongooseCreditPackageRepository implements ICreditPackageRepository {
  private toDomain(doc: ICreditPackageDocument): CreditPackage {
    const id = doc.id ?? doc._id?.toString?.() ?? doc.code;
    return new CreditPackage(
      id,
      doc.code,
      doc.label,
      doc.baseAmount,
      doc.bonusAmount,
      doc.currency,
      doc.price,
      doc.description,
      doc.isActive,
      doc.createdAt,
      doc.updatedAt,
    );
  }

  async listActive(): Promise<CreditPackage[]> {
    const docs = await CreditPackageModel.find({ isActive: true }).lean<ICreditPackageDocument[]>();
    return docs.map((doc) => this.toDomain(doc as ICreditPackageDocument));
  }

  async findById(id: string): Promise<CreditPackage | null> {
    const doc = await CreditPackageModel.findById(id).lean<ICreditPackageDocument>();
    if (!doc) {
      return null;
    }
    return this.toDomain(doc as ICreditPackageDocument);
  }

  async save(creditPackage: CreditPackage): Promise<CreditPackage> {
    const payload = {
      code: creditPackage.code,
      label: creditPackage.label,
      baseAmount: creditPackage.baseAmount,
      bonusAmount: creditPackage.bonusAmount,
      currency: creditPackage.currency,
      price: creditPackage.price,
      description: creditPackage.description,
      isActive: creditPackage.isActive,
      updatedAt: new Date(),
    };

    const saved = await CreditPackageModel.findOneAndUpdate(
      { _id: creditPackage.id },
      {
        $set: payload,
        $setOnInsert: {
          createdAt: creditPackage.createdAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean<ICreditPackageDocument>();

    if (!saved) {
      throw new Error('Falha ao salvar pacote de créditos');
    }

    return this.toDomain(saved as ICreditPackageDocument);
  }
}
