import { AppError } from '@/shared/errors/AppError';
import { cacheConfig } from '@/shared/config/cacheConfig';
import { redisClient } from '@/infrastructure/cache/RedisClient';
import { idempotencyClaimCounter } from '@/infrastructure/observability/metrics';

type IdempotencyRecord<T> = {
  fingerprint: string;
  status: 'PROCESSING' | 'COMPLETED';
  result?: T;
};

export interface IdempotencyStore {
  get<T>(key: string): Promise<IdempotencyRecord<T> | null>;
  setIfAbsent<T>(key: string, value: IdempotencyRecord<T>, ttlSeconds: number): Promise<boolean>;
  set<T>(key: string, value: IdempotencyRecord<T>, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord<unknown>>();

  async get<T>(key: string): Promise<IdempotencyRecord<T> | null> {
    return (this.records.get(key) as IdempotencyRecord<T> | undefined) ?? null;
  }

  async setIfAbsent<T>(
    key: string,
    value: IdempotencyRecord<T>,
    _ttlSeconds: number,
  ): Promise<boolean> {
    if (this.records.has(key)) {
      return false;
    }
    this.records.set(key, value);
    return true;
  }

  async set<T>(key: string, value: IdempotencyRecord<T>, _ttlSeconds: number): Promise<void> {
    this.records.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }
}

class RedisIdempotencyStore implements IdempotencyStore {
  get<T>(key: string): Promise<IdempotencyRecord<T> | null> {
    return redisClient.get<IdempotencyRecord<T>>(key);
  }

  setIfAbsent<T>(key: string, value: IdempotencyRecord<T>, ttlSeconds: number): Promise<boolean> {
    return redisClient.setIfAbsent(key, value, ttlSeconds);
  }

  set<T>(key: string, value: IdempotencyRecord<T>, ttlSeconds: number): Promise<void> {
    return redisClient.set(key, value, ttlSeconds);
  }

  delete(key: string): Promise<void> {
    return redisClient.del(key);
  }
}

export class IdempotencyService {
  constructor(
    private readonly store: IdempotencyStore,
    private readonly ttlSeconds = 24 * 60 * 60,
  ) {}

  async execute<T>(
    key: string,
    fingerprint: string,
    operation: () => Promise<T>,
    restoreResult?: (result: T) => T,
  ): Promise<T> {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      throw new AppError('VALIDATION_ERROR', 'Idempotency-Key não pode ser vazio', 400);
    }

    const storageKey = `backbet:idempotency:${normalizedKey}`;
    const existing = await this.store.get<T>(storageKey);
    if (existing) {
      idempotencyClaimCounter.inc({ operation: this.operationFromKey(normalizedKey), result: 'replay' });
      return this.resolveExisting(storageKey, existing, fingerprint, restoreResult);
    }

    const claimed = await this.store.setIfAbsent(
      storageKey,
      { fingerprint, status: 'PROCESSING' },
      this.ttlSeconds,
    );
    if (!claimed) {
      idempotencyClaimCounter.inc({ operation: this.operationFromKey(normalizedKey), result: 'conflict' });
      const concurrent = await this.store.get<T>(storageKey);
      if (concurrent) {
        return this.resolveExisting(storageKey, concurrent, fingerprint, restoreResult);
      }
      throw new AppError('SERVICE_UNAVAILABLE', 'Não foi possível reservar a operação', 503);
    }

    idempotencyClaimCounter.inc({ operation: this.operationFromKey(normalizedKey), result: 'claimed' });

    try {
      const result = await operation();
      await this.store.set(storageKey, { fingerprint, status: 'COMPLETED', result }, this.ttlSeconds);
      return result;
    } catch (error) {
      await this.store.delete(storageKey);
      throw error;
    }
  }

  private operationFromKey(key: string): string {
    return key.split(':')[1] || 'unknown';
  }

  private resolveExisting<T>(
    key: string,
    existing: IdempotencyRecord<T>,
    fingerprint: string,
    restoreResult?: (result: T) => T,
  ): T {
    if (existing.fingerprint !== fingerprint) {
      throw new AppError(
        'CONFLICT',
        'A Idempotency-Key já foi usada com dados diferentes',
        409,
        { key },
      );
    }
    if (existing.status === 'COMPLETED' && existing.result !== undefined) {
      return restoreResult ? restoreResult(existing.result) : existing.result;
    }
    throw new AppError('CONFLICT', 'A operação com esta Idempotency-Key já está em processamento', 409);
  }
}

export const idempotencyService = new IdempotencyService(
  cacheConfig.enabled ? new RedisIdempotencyStore() : new InMemoryIdempotencyStore(),
);