import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { RiskExposureCounter } from '@/core/risk/domain/entities/RiskExposureCounter';
import { RiskExposureScope } from '@/core/risk/types/risk.types';
import { RiskProfileModel } from '../schemas/RiskProfileSchema';
import { RiskExposureCounterModel } from '../schemas/RiskExposureCounterSchema';
import { AppError } from '@/shared/errors/AppError';
import { RiskRepositoryOptions } from '@/core/risk/domain/repositories/IRiskRepository';
import { RISK_CONFIG } from '@/core/risk/config/risk-config';
import { isRetryableTransactionError } from '../errors/retryableTransactionError';
import { RiskExposureUnderflowError } from '@/core/risk/domain/errors/RiskExposureUnderflowError';

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
      if (isRetryableTransactionError(error)) {
        throw error;
      }
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
      if (isRetryableTransactionError(error)) {
        throw error;
      }
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
      if (isRetryableTransactionError(error)) {
        throw error;
      }
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao incrementar exposição', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }

  async decreaseExposure(userId: string, amountCents: number, options: RiskRepositoryOptions = {}): Promise<void> {
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      throw new AppError('VALIDATION_ERROR', 'amountCents deve ser um inteiro não-negativo', 400, {
        amountCents,
      });
    }
    try {
      // Decremento condicional atômico: só decrementa se houver exposição
      // suficiente. Nunca satura em zero, pois isso esconderia a inconsistência.
      const query = RiskProfileModel.findOneAndUpdate(
        { userId, $expr: { $gte: ['$exposureCents', amountCents] } },
        { $inc: { exposureCents: -amountCents } },
        { new: true },
      );
      if (options.session) query.session(options.session as never);
      const res = await query.lean<RiskProfileRecord | null>();

      if (!res) {
        throw new RiskExposureUnderflowError({
          scope: 'USER',
          refId: userId,
          requestedCents: amountCents,
          currentCents: await this.readUserExposure(userId, options),
          recordExists: await this.userProfileExists(userId, options),
        });
      }
    } catch (error: unknown) {
      if (error instanceof RiskExposureUnderflowError) {
        throw error;
      }
      if (isRetryableTransactionError(error)) {
        throw error;
      }
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao decrementar exposição', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }

  private async readUserExposure(userId: string, options: RiskRepositoryOptions): Promise<number> {
    const query = RiskProfileModel.findOne({ userId });
    if (options.session) query.session(options.session as never);
    const doc = await query.lean<RiskProfileRecord | null>();
    return doc?.exposureCents ?? 0;
  }

  private async userProfileExists(userId: string, options: RiskRepositoryOptions): Promise<boolean> {
    const query = RiskProfileModel.findOne({ userId }).select('_id');
    if (options.session) query.session(options.session as never);
    const doc = await query.lean<{ _id?: unknown } | null>();
    return doc !== null;
  }

  async getExposure(userId: string): Promise<number> {
    try {
      const doc = await RiskProfileModel.findOne({ userId }).lean<RiskProfileRecord | null>();
      return (doc?.exposureCents ?? 0) / 100;
    } catch (error: unknown) {
      if (isRetryableTransactionError(error)) {
        throw error;
      }
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao obter exposição', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }

  async getTotalExposure(): Promise<{ exposureCents: number; openProfiles: number }> {
    try {
      const rows = await RiskProfileModel.aggregate<{ total: number; totalCount: number }>([
        { $match: { exposureCents: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$exposureCents' }, totalCount: { $sum: 1 } } },
      ]);
      const row = rows[0];
      return { exposureCents: row?.total ?? 0, openProfiles: row?.totalCount ?? 0 };
    } catch (error: unknown) {
      if (isRetryableTransactionError(error)) {
        throw error;
      }
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao obter exposição total', 500, {
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
      if (isRetryableTransactionError(error)) {
        throw error;
      }
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
      if (isRetryableTransactionError(error)) {
        throw error;
      }
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
      if (isRetryableTransactionError(error)) {
        throw error;
      }
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
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      throw new AppError('VALIDATION_ERROR', 'amountCents deve ser um inteiro não-negativo', 400, {
        amountCents,
      });
    }
    try {
      // Idem decreaseExposure: condicional e atômico, sem clamp em zero.
      const query = RiskExposureCounterModel.findOneAndUpdate(
        { scope, refId, $expr: { $gte: ['$exposureCents', amountCents] } },
        { $inc: { exposureCents: -amountCents } },
        { new: true },
      );
      if (options.session) query.session(options.session as never);
      const res = await query.lean<RiskCounterRecord | null>();

      if (!res) {
        const currentQuery = RiskExposureCounterModel.findOne({ scope, refId });
        if (options.session) currentQuery.session(options.session as never);
        const current = await currentQuery.lean<RiskCounterRecord | null>();
        throw new RiskExposureUnderflowError({
          scope,
          refId,
          requestedCents: amountCents,
          currentCents: current?.exposureCents ?? 0,
          recordExists: current !== null,
        });
      }
    } catch (error: unknown) {
      if (error instanceof RiskExposureUnderflowError) {
        throw error;
      }
      if (isRetryableTransactionError(error)) {
        throw error;
      }
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
      if (isRetryableTransactionError(error)) {
        throw error;
      }
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao definir exposição por contador', 500, {
        originalError: getErrorMessage(error),
      });
    }
  }
}
