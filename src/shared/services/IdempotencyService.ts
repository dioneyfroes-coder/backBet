import { AppError } from '@/shared/errors/AppError';
import { cacheConfig } from '@/shared/config/cacheConfig';
import { redisClient } from '@/infrastructure/cache/RedisClient';
import { idempotencyClaimCounter } from '@/infrastructure/observability/metrics';
import { MongoIdempotencyStore } from '@/infrastructure/persistence/mongoose/stores/MongoIdempotencyStore';

export type IdempotencyRecord<T> = {
  fingerprint: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  result?: T;
};

export type IdempotencyExecutionResult<T> = {
  value: T;
  replayed: boolean;
};

export interface IdempotencyStore {
  get<T>(key: string): Promise<IdempotencyRecord<T> | null>;
  setIfAbsent<T>(key: string, value: IdempotencyRecord<T>, ttlSeconds: number): Promise<boolean>;
  set<T>(key: string, value: IdempotencyRecord<T>, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  /**
   * Tenta reivindicar atomicamente uma entry PROCESSING abandonada (ex.: worker
   * morto) parada há mais de `olderThanMs`. Retorna a entrada se conseguiu
   * reclamar; null caso contrário. Implementada pelo Mongo e pelo in-memory.
   */
  reclaimStaleProcessing?<T>(
    key: string,
    olderThanMs: number,
  ): Promise<IdempotencyRecord<T> | null>;
}

// Tempo padrão após o qual uma operação PROCESSING é considerada abandonada e
// pode ser recuperada (configurável via IDEMPOTENCY_PROCESSING_RECOVERY_MS).
export const IDEMPOTENCY_PROCESSING_RECOVERY_MS: number = (() => {
  const raw = Number(process.env.IDEMPOTENCY_PROCESSING_RECOVERY_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5 * 60 * 1000;
})();

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord<unknown>>();
  private readonly processingAtByKey = new Map<string, number>();

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
    this.processingAtByKey.set(key, Date.now());
    return true;
  }

  async set<T>(key: string, value: IdempotencyRecord<T>, _ttlSeconds: number): Promise<void> {
    this.records.set(key, value);
    this.processingAtByKey.set(key, Date.now());
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
    this.processingAtByKey.delete(key);
  }

  async reclaimStaleProcessing<T>(
    key: string,
    olderThanMs: number,
  ): Promise<IdempotencyRecord<T> | null> {
    const record = this.records.get(key) as IdempotencyRecord<T> | undefined;
    const processingAt = this.processingAtByKey.get(key);
    if (!record || record.status !== 'PROCESSING' || processingAt === undefined) {
      return null;
    }
    if (Date.now() - processingAt < olderThanMs) {
      return null;
    }
    this.processingAtByKey.set(key, Date.now());
    return record;
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

  // Best effort não-atômico (Redis simples): como o retry só ocorre para
  // operações financeiras com idempotência no ledger, o re-executar não duplica
  // valores; serve para destravar rows PROCESSING de cache.
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
    return existing;
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
    recoveryMs?: number,
  ): Promise<T> {
    return (await this.executeWithMeta(key, fingerprint, operation, restoreResult, recoveryMs))
      .value;
  }

  async executeWithMeta<T>(
    key: string,
    fingerprint: string,
    operation: () => Promise<T>,
    restoreResult?: (result: T) => T,
    recoveryMs?: number,
  ): Promise<IdempotencyExecutionResult<T>> {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      throw new AppError('VALIDATION_ERROR', 'Idempotency-Key não pode ser vazio', 400);
    }

    const storageKey = `backbet:idempotency:${normalizedKey}`;
    const existing = await this.store.get<T>(storageKey);
    if (existing) {
      if (existing.status === 'PROCESSING' && recoveryMs && recoveryMs > 0) {
        const recovered = await this.tryRecover(storageKey, recoveryMs);
        if (recovered === 'recovered') {
          return this.runAndPersist(
            storageKey,
            normalizedKey,
            fingerprint,
            operation,
            'recovered',
          );
        }
      }
      idempotencyClaimCounter.inc({ operation: this.operationFromKey(normalizedKey), result: 'replay' });
      return this.resolveExistingMeta(storageKey, existing, fingerprint, restoreResult);
    }

    const claimed = await this.store.setIfAbsent(
      storageKey,
      { fingerprint, status: 'PROCESSING' },
      this.ttlSeconds,
    );
    if (!claimed) {
      if (recoveryMs && recoveryMs > 0) {
        const recovered = await this.tryRecover(storageKey, recoveryMs);
        if (recovered === 'recovered') {
          return this.runAndPersist(
            storageKey,
            normalizedKey,
            fingerprint,
            operation,
            'recovered',
          );
        }
      }
      idempotencyClaimCounter.inc({ operation: this.operationFromKey(normalizedKey), result: 'conflict' });
      const concurrent = await this.store.get<T>(storageKey);
      if (concurrent) {
        return this.resolveExistingMeta(storageKey, concurrent, fingerprint, restoreResult);
      }
      throw new AppError('SERVICE_UNAVAILABLE', 'Não foi possível reservar a operação', 503);
    }

    return this.runAndPersist(storageKey, normalizedKey, fingerprint, operation, 'claimed');
  }

  private async tryRecover<T>(
    storageKey: string,
    recoveryMs: number,
  ): Promise<'recovered' | 'not-stale' | 'unsupported'> {
    const store = this.store;
    if (typeof store.reclaimStaleProcessing !== 'function') {
      return 'unsupported';
    }
    const record = await store.reclaimStaleProcessing<T>(storageKey, recoveryMs);
    if (!record) {
      return 'not-stale';
    }
    return 'recovered';
  }

  private async runAndPersist<T>(
    storageKey: string,
    normalizedKey: string,
    fingerprint: string,
    operation: () => Promise<T>,
    claimResult: 'claimed' | 'recovered',
  ): Promise<IdempotencyExecutionResult<T>> {
    idempotencyClaimCounter.inc({
      operation: this.operationFromKey(normalizedKey),
      result: claimResult,
    });
    try {
      const result = await operation();
      await this.store.set(storageKey, { fingerprint, status: 'COMPLETED', result }, this.ttlSeconds);
      return { value: result, replayed: false };
    } catch (error) {
      await this.store.delete(storageKey);
      throw error;
    }
  }

  private operationFromKey(key: string): string {
    const parts = key.split(':');
    // Standard: "userId:op:rest" — the operation is parts[1].
    // Worker keys: "withdrawal-payout:<uuid>" / "contact-email:<...>" — use parts[0].
    if (parts.length >= 3) return parts[1];
    return parts[0] || 'unknown';
  }

  private resolveExistingMeta<T>(
    key: string,
    existing: IdempotencyRecord<T>,
    fingerprint: string,
    restoreResult?: (result: T) => T,
  ): IdempotencyExecutionResult<T> {
    if (existing.fingerprint !== fingerprint) {
      throw new AppError(
        'CONFLICT',
        'A Idempotency-Key já foi usada com dados diferentes',
        409,
        { key },
      );
    }
    if (existing.status === 'COMPLETED' && existing.result !== undefined) {
      return {
        value: restoreResult ? restoreResult(existing.result) : existing.result,
        replayed: true,
      };
    }
    throw new AppError('CONFLICT', 'A operação com esta Idempotency-Key já está em processamento', 409);
  }
}

export const idempotencyService = new IdempotencyService(
  process.env.USE_MONGOOSE_PERSISTENCE === 'true'
    ? new MongoIdempotencyStore()
    : cacheConfig.enabled
      ? new RedisIdempotencyStore()
      : new InMemoryIdempotencyStore(),
);