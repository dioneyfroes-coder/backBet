import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { RiskProfileModel } from '../schemas/RiskProfileSchema';
import { AppError } from '@/shared/errors/AppError';

export class MongooseRiskRepository implements IRiskRepository {
  async getByUserId(userId: string): Promise<RiskProfile | null> {
    try {
      const doc = await RiskProfileModel.findOne({ userId }).lean();
      if (!doc) return null;
      return new RiskProfile(doc.userId, doc.exposure, doc.maxExposure);
    } catch (error: any) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao buscar perfil de risco', 500, {
        originalError: error?.message,
      });
    }
  }

  async upsert(profile: RiskProfile): Promise<void> {
    try {
      await RiskProfileModel.findOneAndUpdate(
        { userId: profile.userId },
        { exposure: profile.exposure, maxExposure: profile.maxExposure },
        { upsert: true, new: true },
      );
    } catch (error: any) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao salvar perfil de risco', 500, {
        originalError: error?.message,
      });
    }
  }

  async increaseExposure(userId: string, amount: number): Promise<void> {
    try {
      await RiskProfileModel.findOneAndUpdate(
        { userId },
        { $inc: { exposure: amount } },
        { upsert: true },
      );
    } catch (error: any) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao incrementar exposição', 500, {
        originalError: error?.message,
      });
    }
  }

  async decreaseExposure(userId: string, amount: number): Promise<void> {
    try {
      const res = await RiskProfileModel.findOneAndUpdate(
        { userId },
        { $inc: { exposure: -Math.abs(amount) } },
        { new: true },
      );
      if (res && res.exposure < 0) {
        // normalize to zero
        await RiskProfileModel.findByIdAndUpdate(res._id, { exposure: 0 });
      }
    } catch (error: any) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao decrementar exposição', 500, {
        originalError: error?.message,
      });
    }
  }

  async getExposure(userId: string): Promise<number> {
    try {
      const doc = await RiskProfileModel.findOne({ userId }).lean();
      return doc?.exposure ?? 0;
    } catch (error: any) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao obter exposição', 500, {
        originalError: error?.message,
      });
    }
  }
}
