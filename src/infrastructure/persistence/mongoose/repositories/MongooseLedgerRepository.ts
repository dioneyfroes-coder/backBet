import {
  ILedgerRepository,
  LedgerRepositoryOptions,
} from '@/core/finance/domain/repositories/ILedgerRepository';
import { LedgerEntry } from '@/core/finance/domain/entities/LedgerEntry';
import { AppError } from '@/shared/errors/AppError';
import { ILedgerEntryDocument, LedgerEntryModel } from '../schemas/LedgerEntrySchema';

type LedgerDoc = ILedgerEntryDocument & { _id: unknown };

export class MongooseLedgerRepository implements ILedgerRepository {
  async append(entry: LedgerEntry, options: LedgerRepositoryOptions = {}): Promise<LedgerEntry> {
    try {
      const docData = {
        transactionId: entry.transactionId,
        userId: entry.userId,
        type: entry.type,
        amountCents: entry.amountCents,
        currency: entry.currency,
        referenceId: entry.referenceId,
        source: entry.source,
        status: entry.status,
        createdAt: entry.createdAt,
        metadata: entry.metadata ?? null,
      };
      const query = LedgerEntryModel.findOneAndUpdate(
        { transactionId: entry.transactionId },
        docData,
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      if (options.session) query.session(options.session as never);
      await query;
      return entry;
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao registrar entrada de ledger', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async findByUserId(
    userId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<LedgerEntry[]> {
    const limit = normalize(options.limit, 50);
    const offset = normalize(options.offset, 0);
    const docs = await LedgerEntryModel.find({ userId })
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .lean<LedgerDoc[]>();
    return docs.map((doc) => this.toDomain(doc));
  }

  async countByUserId(userId: string): Promise<number> {
    return LedgerEntryModel.countDocuments({ userId });
  }

  async withTransaction<T>(work: (session: unknown) => Promise<T>): Promise<T> {
    const session = await LedgerEntryModel.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } finally {
      await session.endSession();
    }
  }

  private toDomain(doc: LedgerDoc): LedgerEntry {
    return new LedgerEntry(
      doc.transactionId,
      doc.userId,
      doc.type,
      doc.amountCents,
      doc.currency,
      doc.referenceId ?? undefined,
      doc.source ?? undefined,
      doc.status,
      doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt),
      doc.metadata ?? undefined,
    );
  }
}

const normalize = (value: number | undefined, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  return fallback;
};
