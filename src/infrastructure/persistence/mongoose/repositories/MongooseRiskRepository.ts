import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { RiskExposureCounter } from '@/core/risk/domain/entities/RiskExposureCounter';
import { RiskExposureScope } from '@/core/risk/types/risk.types';
import { RiskProfileModel } from '../schemas/RiskProfileSchema';
import { RiskExposureCounterModel } from '../schemas/RiskExposureCounterSchema';
import { AppError } from '@/shared/errors/AppError';
import { RiskRepositoryOptions } from '@/core/risk/domain/repositories/IRiskRepository';
import { RISK_CONFIG } from '@/core/risk/config/risk-config';

type RiskProfileRecord = {
  _id?: string | { toString(): string };
  userId: string;
  exposureCents: number;
  maxExposureCents: number;
};

type RiskCounterRecord = {
  _id?: string | { toString(): string };
  scope: RiskExposureScope;
  refId: string;
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

const mapCounterToDomain = (record: RiskCounterRecord): RiskExposureCounter =>
  new RiskExposureCounter(
    record.scope,
    record.refId,
    record.exposureCents,
    record.maxExposureCents,
  );

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

  async reserveExposure(
    userId: string,
    amountCents: number,
    options: RiskRepositoryOptions = {},
  ): Promise<boolean> {
    try {
      // Ensure the profile exists before applying the conditional increment.
      // $setOnInsert sets the default limit only when creating a fresh document,
      // so a brand-new profile starts with the configured max exposure instead of 0.
      const ensure = RiskProfileModel.findOneAndUpdate(
        { userId },
        {
          $setOnInsert: {
            exposureCents: 0,
            maxExposureCents: RISK_CONFIG.MAX_EXPOSURE_PER_USER * 100,
          },
        },
        { upsert: true },
      );
      if (options.session) ensure.session(options.session as never);
      await ensure;

      // Atomic conditional increment: only matched (and updated) if the post-state
      // stays within the limit. A single findOneAndUpdate on one document is atomic,
      // so concurrent reservations serialize here.
      const query = RiskProfileModel.findOneAndUpdate(
        {
          userId,
          $expr: { $lte: [{ $add: ['$exposureCents', amountCents] }, '$maxExposureCents'] },
        },
        { $inc: { exposureCents: amountCents } },
        { new: true },
      );
      if (options.session) query.session(options.session as never);
      const res = await query.lean<RiskProfileRecord | null>();
      return res !== null;
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao reservar exposição', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }

  private counterDefaultMax(scope: RiskExposureScope): number {
    return (scope === 'EVENT'
      ? RISK_CONFIG.MAX_EXPOSURE_PER_EVENT
      : RISK_CONFIG.MAX_EXPOSURE_PER_MARKET) * 100;
  }

  async getCounter(
    scope: RiskExposureScope,
    refId: string,
  ): Promise<RiskExposureCounter | null> {
    try {
      const doc = await RiskExposureCounterModel.findOne({ scope, refId }).lean<
        RiskCounterRecord | null
      >();
      if (!doc) return null;
      return mapCounterToDomain(doc);
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao obter contador de exposição', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }

  async reserveCounter(
    scope: RiskExposureScope,
    refId: string,
    amountCents: number,
    options: RiskRepositoryOptions = {},
  ): Promise<boolean> {
    try {
      // Ensure the counter exists (with the configured default limit) before the
      // conditional increment.
      const ensure = RiskExposureCounterModel.findOneAndUpdate(
        { scope, refId },
        {
          $setOnInsert: {
            scope,
            refId,
            exposureCents: 0,
            maxExposureCents: this.counterDefaultMax(scope),
          },
        },
        { upsert: true },
      );
      if (options.session) ensure.session(options.session as never);
      await ensure;

      const query = RiskExposureCounterModel.findOneAndUpdate(
        {
          scope,
          refId,
          $expr: { $lte: [{ $add: ['$exposureCents', amountCents] }, '$maxExposureCents'] },
        },
        { $inc: { exposureCents: amountCents } },
        { new: true },
      );
      if (options.session) query.session(options.session as never);
      const res = await query.lean<RiskCounterRecord | null>();
      return res !== null;
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao reservar exposição por contador', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }

  async decreaseCounter(
    scope: RiskExposureScope,
    refId: string,
    amountCents: number,
    options: RiskRepositoryOptions = {},
  ): Promise<void> {
    try {
      const query = RiskExposureCounterModel.findOneAndUpdate(
        { scope, refId },
        { $inc: { exposureCents: -Math.abs(amountCents) } },
        { new: true },
      );
      if (options.session) query.session(options.session as never);
      const res = await query.lean<RiskCounterRecord | null>();

      if (res && res.exposureCents < 0) {
        const normalizedId = normalizeRecordId(res._id);
        if (normalizedId) {
          const correction = RiskExposureCounterModel.findByIdAndUpdate(normalizedId, {
            exposureCents: 0,
          });
          if (options.session) correction.session(options.session as never);
          await correction;
        }
      }
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao decrementar exposição por contador', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }

  async setCounterExposure(
    scope: RiskExposureScope,
    refId: string,
    exposureCents: number,
    options: RiskRepositoryOptions = {},
  ): Promise<void> {
    try {
      const query = RiskExposureCounterModel.findOneAndUpdate(
        { scope, refId },
        {
          $set: { exposureCents },
          $setOnInsert: { scope, refId, maxExposureCents: this.counterDefaultMax(scope) },
        },
        { upsert: true },
      );
      if (options.session) query.session(options.session as never);
      await query;
    } catch (error: unknown) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao definir exposição por contador', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }
}
