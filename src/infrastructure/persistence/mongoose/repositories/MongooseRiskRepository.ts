import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { RiskProfileModel } from '../schemas/RiskProfileSchema';
import { AppError } from '@/shared/errors/AppError';

type RiskProfileRecord = {
  _id?: string | { toString(): string };
  userId: string;
  exposure: number;
  maxExposure: number;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'unknown';

const normalizeRecordId = (id?: RiskProfileRecord['_id']): string | null => {
  if (!id) {
    return null;
  }
  return typeof id === 'string' ? id : id.toString();
};

const mapToDomain = (record: RiskProfileRecord): RiskProfile =>
  new RiskProfile(record.userId, record.exposure, record.maxExposure);

export class MongooseRiskRepository implements IRiskRepository {
  async getByUserId(userId: string): Promise<RiskProfile | null> {
    try {
      const doc = await RiskProfileModel.findOne({ userId }).lean<RiskProfileRecord | null>();
      if (!doc) return null;
      return mapToDomain(doc);
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao buscar perfil de risco', 500, {
        originalError: getErrorMessage(error),
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
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao salvar perfil de risco', 500, {
        originalError: getErrorMessage(error),
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
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao incrementar exposição', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }

  async decreaseExposure(userId: string, amount: number): Promise<void> {
    try {
      const res = await RiskProfileModel.findOneAndUpdate(
        { userId },
        { $inc: { exposure: -Math.abs(amount) } },
        { new: true },
      ).lean<RiskProfileRecord | null>();

      if (res && res.exposure < 0) {
        const normalizedId = normalizeRecordId(res._id);
        if (normalizedId) {
          await RiskProfileModel.findByIdAndUpdate(normalizedId, { exposure: 0 });
        }
      }
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao decrementar exposição', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }

  async getExposure(userId: string): Promise<number> {
    try {
      const doc = await RiskProfileModel.findOne({ userId }).lean<RiskProfileRecord | null>();
      return doc?.exposure ?? 0;
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao obter exposição', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }
}
