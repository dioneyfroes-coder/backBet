import { IdempotencyStore, IdempotencyRecord } from '@/shared/services/IdempotencyService';
import { IdempotencyEntryModel } from '../schemas/IdempotencyEntrySchema';

type IdempotencyDoc = {
  key: string;
  fingerprint: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  result?: unknown;
  processingAt?: Date;
};

export class MongoIdempotencyStore implements IdempotencyStore {
  private initPromise?: Promise<unknown>;

  private async ensureIndex(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = IdempotencyEntryModel.init().then(() => undefined);
    }
    await this.initPromise;
  }

  private mapDoc(doc: IdempotencyDoc): IdempotencyRecord<unknown> {
    return {
      fingerprint: doc.fingerprint,
      status: doc.status,
      result: doc.result,
    };
  }

  async get<T>(key: string): Promise<IdempotencyRecord<T> | null> {
    await this.ensureIndex();
    const doc = await IdempotencyEntryModel.findOne({ key }).lean<IdempotencyDoc | null>();
    if (!doc) return null;
    return this.mapDoc(doc) as IdempotencyRecord<T>;
  }

  async setIfAbsent<T>(
    key: string,
    value: IdempotencyRecord<T>,
    _ttlSeconds: number,
  ): Promise<boolean> {
    await this.ensureIndex();
    const res = await IdempotencyEntryModel.findOneAndUpdate(
      { key },
      {
        $setOnInsert: {
          key,
          fingerprint: value.fingerprint,
          status: value.status,
          result: value.result,
          processingAt: new Date(),
        },
      },
      { upsert: true, new: true, rawResult: true },
    );
    const raw = res as unknown as { lastErrorObject?: { updatedExisting?: boolean } } | null;
    return !(raw?.lastErrorObject?.updatedExisting ?? true);
  }

  async set<T>(key: string, value: IdempotencyRecord<T>, _ttlSeconds: number): Promise<void> {
    await this.ensureIndex();
    await IdempotencyEntryModel.updateOne(
      { key },
      {
        $set: {
          fingerprint: value.fingerprint,
          status: value.status,
          result: value.result,
          processingAt: new Date(),
        },
      },
    );
  }

  async delete(key: string): Promise<void> {
    await this.ensureIndex();
    await IdempotencyEntryModel.deleteOne({ key });
  }

  /**
   * Reivindica (de forma atômica) uma entry PROCESSING abandonada — ex.: o
   * container morreu durante a execução — desde que esteja parada por mais de
   * `olderThanMs`. Apenas uma instância vence o findOneAndUpdate; as demais
   * recebem null e seguem com CONFLICT/replay.
   */
  async reclaimStaleProcessing<T>(
    key: string,
    olderThanMs: number,
  ): Promise<IdempotencyRecord<T> | null> {
    await this.ensureIndex();
    const cutoff = new Date(Date.now() - olderThanMs);
    const doc = await IdempotencyEntryModel.findOneAndUpdate(
      { key, status: 'PROCESSING', processingAt: { $lt: cutoff } },
      { $set: { processingAt: new Date() } },
      { new: true },
    ).lean<IdempotencyDoc | null>();
    if (!doc) return null;
    return this.mapDoc(doc) as IdempotencyRecord<T>;
  }
}