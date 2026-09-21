import { redisClient } from '@/infrastructure/cache/RedisClient';
import {
  IdempotencyRecord,
  IdempotencyStore,
} from '@/shared/services/IdempotencyService';

/**
 * Store de idempotência sobre Redis.
 *
 * Todas as operações usam as variantes "strict" do RedisClient: erro de Redis
 * propaga em vez de virar `null`/`false` silencioso. Como o estado de
 * idempotência protege o caminho financeiro, falha de infraestrutura precisa
 * ser explícita (ver item 8.2 do plano).
 */
export class RedisIdempotencyStore implements IdempotencyStore {
  private readonly defaultTtlSeconds = 24 * 60 * 60;
  // TTL curto do lock de reclaim: limita o pior caso caso o worker morra entre
  // adquirir o lock e liberá-lo.
  private readonly reclaimLockTtlSeconds = 30;

  get<T>(key: string): Promise<IdempotencyRecord<T> | null> {
    return redisClient.getStrict<IdempotencyRecord<T>>(key);
  }

  setIfAbsent<T>(key: string, value: IdempotencyRecord<T>, ttlSeconds: number): Promise<boolean> {
    return redisClient.setIfAbsentStrict(
      key,
      { ...value, processingAt: Date.now() } as IdempotencyRecord<T>,
      ttlSeconds,
    );
  }

  set<T>(key: string, value: IdempotencyRecord<T>, ttlSeconds: number): Promise<void> {
    return redisClient.setStrict(
      key,
      { ...value, processingAt: Date.now() } as IdempotencyRecord<T>,
      ttlSeconds,
    );
  }

  delete(key: string): Promise<void> {
    return redisClient.delStrict(key);
  }

  /**
   * Reclaim atômico de uma entry PROCESSING abandonada.
   *
   * O claim do direito de reclaim é feito com `SET NX` num lock dedicado; quem
   * não obtém o lock é rejeitado. Sob o lock há uma releitura para evitar corrida
   * com uma conclusão concorrente, e só então o `processingAt` é renovado.
   * Resultado: no máximo um worker assume a operação.
   */
  async reclaimStaleProcessing<T>(
    key: string,
    olderThanMs: number,
  ): Promise<IdempotencyRecord<T> | null> {
    const existing = await redisClient.getStrict<IdempotencyRecord<T>>(key);
    if (!this.isStaleProcessing(existing, olderThanMs)) {
      return null;
    }

    const lockKey = `${key}:reclaim`;
    const lockAcquired = await redisClient.setIfAbsentStrict(
      lockKey,
      { at: Date.now() },
      this.reclaimLockTtlSeconds,
    );
    if (!lockAcquired) {
      return null;
    }

    try {
      const current = await redisClient.getStrict<IdempotencyRecord<T>>(key);
      if (!this.isStaleProcessing(current, olderThanMs)) {
        return null;
      }
      const renewed = { ...current, processingAt: Date.now() } as IdempotencyRecord<T>;
      await redisClient.setStrict(key, renewed, this.defaultTtlSeconds);
      return renewed;
    } finally {
      await redisClient.delStrict(lockKey).catch(() => undefined);
    }
  }

  private isStaleProcessing<T>(
    record: IdempotencyRecord<T> | null,
    olderThanMs: number,
  ): boolean {
    if (!record || record.status !== 'PROCESSING') {
      return false;
    }
    const processingAt = (record as { processingAt?: number }).processingAt;
    if (processingAt === undefined) {
      return false;
    }
    return Date.now() - processingAt >= olderThanMs;
  }
}
