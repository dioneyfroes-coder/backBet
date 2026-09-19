import { redisClient } from '@/infrastructure/cache/RedisClient';
import {
  IdempotencyRecord,
  IdempotencyStore,
} from '@/shared/services/IdempotencyService';

export class RedisIdempotencyStore implements IdempotencyStore {
  private readonly defaultTtlSeconds = 24 * 60 * 60;

  get<T>(key: string): Promise<IdempotencyRecord<T> | null> {
    return redisClient.get<IdempotencyRecord<T>>(key);
  }

  setIfAbsent<T>(key: string, value: IdempotencyRecord<T>, ttlSeconds: number): Promise<boolean> {
    return redisClient.setIfAbsent(
      key,
      { ...value, processingAt: Date.now() } as IdempotencyRecord<T>,
      ttlSeconds,
    );
  }

  set<T>(key: string, value: IdempotencyRecord<T>, ttlSeconds: number): Promise<void> {
    return redisClient.set(
      key,
      { ...value, processingAt: Date.now() } as IdempotencyRecord<T>,
      ttlSeconds,
    );
  }

  delete(key: string): Promise<void> {
    return redisClient.del(key);
  }

  // Best effort não-atômico (Redis simples): como o retry só ocorre para
  // operações financeiras com idempotência no ledger, o re-executar não duplica
  // valores; serve para destravar rows PROCESSING quando a resposta se perdeu.
  async reclaimStaleProcessing<T>(
    key: string,
    olderThanMs: number,
  ): Promise<IdempotencyRecord<T> | null> {
    const existing = await this.get<T>(key);
    const processingAt = (existing as { processingAt?: number } | null)?.processingAt;
    if (!existing || existing.status !== 'PROCESSING' || processingAt === undefined) {
      return null;
    }
    if (Date.now() - processingAt < olderThanMs) {
      return null;
    }
    // Renova o processingAt para impedir que outro worker reivindique em paralelo.
    await redisClient.set(
      key,
      { ...existing, processingAt: Date.now() } as IdempotencyRecord<T>,
      this.defaultTtlSeconds,
    );
    return existing;
  }
}