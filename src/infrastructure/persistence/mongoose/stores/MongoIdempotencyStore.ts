import { IdempotencyStore, IdempotencyRecord } from '@/shared/services/IdempotencyService';
import { IdempotencyEntryModel } from '../schemas/IdempotencyEntrySchema';

export class MongoIdempotencyStore implements IdempotencyStore {
  private initPromise?: Promise<unknown>;

  private async ensureIndex(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = IdempotencyEntryModel.init().then(() => undefined);
    }
    await this.initPromise;
  }

  async get<T>(key: string): Promise<IdempotencyRecord<T> | null> {
    await this.ensureIndex();
    const doc = await IdempotencyEntryModel.findOne({ key }).lean<
      {
        key: string;
        fingerprint: string;
        status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
        result?: T;
      } | null
    >();
    if (!doc) return null;
    return { fingerprint: doc.fingerprint, status: doc.status, result: doc.result };
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
      { $set: { fingerprint: value.fingerprint, status: value.status, result: value.result } },
    );
  }

  async delete(key: string): Promise<void> {
    await this.ensureIndex();
    await IdempotencyEntryModel.deleteOne({ key });
  }
}
