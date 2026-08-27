import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { RiskProfileModel } from '../schemas/RiskProfileSchema';
import { AppError } from '@/shared/errors/AppError';
import { RiskRepositoryOptions } from '@/core/risk/domain/repositories/IRiskRepository';

type RiskProfileRecord = {
  _id?: string | { toString(): string };
  userId: string;
  exposureCents: number;
  maxExposureCents: number;
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
  new RiskProfile(record.userId, record.exposureCents, record.maxExposureCents);

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

  async upsert(profile: RiskProfile, options: RiskRepositoryOptions = {}): Promise<void> {
    try {
      const query = RiskProfileModel.findOneAndUpdate(
        { userId: profile.userId },
        { exposureCents: profile.exposureCents, maxExposureCents: profile.maxExposureCents },
        { upsert: true, new: true },
      );
      if (options.session) query.session(options.session as never);
      await query;
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao salvar perfil de risco', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }

  async increaseExposure(userId: string, amountCents: number, options: RiskRepositoryOptions = {}): Promise<void> {
    try {
      const query = RiskProfileModel.findOneAndUpdate(
        { userId },
        { $inc: { exposureCents: amountCents } },
        { upsert: true },
      );
      if (options.session) query.session(options.session as never);
      await query;
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao incrementar exposição', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }

  async decreaseExposure(userId: string, amountCents: number, options: RiskRepositoryOptions = {}): Promise<void> {
    try {
      const query = RiskProfileModel.findOneAndUpdate(
        { userId },
        { $inc: { exposureCents: -Math.abs(amountCents) } },
        { new: true },
      );
      if (options.session) query.session(options.session as never);
      const res = await query.lean<RiskProfileRecord | null>();

      if (res && res.exposureCents < 0) {
        const normalizedId = normalizeRecordId(res._id);
        if (normalizedId) {
          const correction = RiskProfileModel.findByIdAndUpdate(normalizedId, { exposureCents: 0 });
          if (options.session) correction.session(options.session as never);
          await correction;
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
      return (doc?.exposureCents ?? 0) / 100;
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao obter exposição', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }
}
