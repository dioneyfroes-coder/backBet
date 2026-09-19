import { RedisIdempotencyStore } from '@/infrastructure/persistence/idempotency/RedisIdempotencyStore';
import { redisClient } from '@/infrastructure/cache/RedisClient';
import { IdempotencyService } from '@/shared/services/IdempotencyService';

jest.mock('@/infrastructure/cache/RedisClient', () => {
  const store = new Map<string, { value: unknown; ttl?: number }>();
  return {
    redisClient: {
      async get<T>(key: string) {
        const entry = store.get(key);
        return entry ? (entry.value as T) : null;
      },
      async set<T>(key: string, value: T, ttlSeconds?: number) {
        store.set(key, { value, ttl: ttlSeconds });
      },
      async setIfAbsent<T>(key: string, value: T, ttlSeconds?: number) {
        if (store.has(key)) {
          return false;
        }
        store.set(key, { value, ttl: ttlSeconds });
        return true;
      },
      async del(key: string) {
        store.delete(key);
      },
      __internalStore: store,
    },
  };
});

describe('RedisIdempotencyStore — processingAt e reclaim (Fase 8)', () => {
  const mockedRedisClient = redisClient as unknown as {
    get: jest.Mock;
    set: jest.Mock;
    setIfAbsent: jest.Mock;
    del: jest.Mock;
    __internalStore: Map<string, { value: unknown; ttl?: number }>;
  };

  const RECOVERY_MS = 5 * 60 * 1000;
  const STORAGE_KEY = 'backbet:idempotency:user-1:deposit:tx-1';

  beforeEach(() => {
    mockedRedisClient.__internalStore.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function freeze(ms: number): void {
    jest.spyOn(Date, 'now').mockReturnValue(ms);
  }

  it('grava processingAt no setIfAbsent para permitir reclaim após restart', async () => {
    const store = new RedisIdempotencyStore();

    freeze(5_000_000);
    const claimed = await store.setIfAbsent(
      STORAGE_KEY,
      { fingerprint: 'fp-1', status: 'PROCESSING' },
      60,
    );

    expect(claimed).toBe(true);
    // Json do RedisClient é materializado no mock; processingAt foi persistido.
    expect((mockedRedisClient.__internalStore.get(STORAGE_KEY)?.value as any).processingAt).toBe(5_000_000);
  });

  it('recupera PROCESSING abandonado além do limite (reclaim) e renova o claim', async () => {
    const store = new RedisIdempotencyStore();

    freeze(5_000_000);
    await store.setIfAbsent(STORAGE_KEY, { fingerprint: 'fp-1', status: 'PROCESSING' }, 60);

    freeze(5_000_000 + RECOVERY_MS + 1);
    const record = await store.reclaimStaleProcessing<{ id: string }>(STORAGE_KEY, RECOVERY_MS);

    expect(record).not.toBeNull();
    if (record) {
      expect(record.status).toBe('PROCESSING');
      expect(record.fingerprint).toBe('fp-1');
    }
    // renew: processingAt foi renovado para não permitir segundo claim concorrente.
    expect((mockedRedisClient.__internalStore.get(STORAGE_KEY)?.value as any).processingAt).toBe(
      5_000_000 + RECOVERY_MS + 1,
    );
  });

  it('não reclama PROCESSING ainda dentro do limite', async () => {
    const store = new RedisIdempotencyStore();

    freeze(6_000_000);
    await store.setIfAbsent(STORAGE_KEY, { fingerprint: 'fp-1', status: 'PROCESSING' }, 60);

    freeze(6_000_000 + RECOVERY_MS - 1000);
    await expect(store.reclaimStaleProcessing<never>(STORAGE_KEY, RECOVERY_MS)).resolves.toBeNull();
  });

  it('integração: IdempotencyService com store Redis reclama e completa a operação', async () => {
    const store = new RedisIdempotencyStore();
    const service = new IdempotencyService(store);
    const operation = jest.fn().mockResolvedValue({ id: 'op-1' });
    const key = 'user-1:deposit:tx-1';

    freeze(7_000_000);
    await store.setIfAbsent(STORAGE_KEY, { fingerprint: 'fp-1', status: 'PROCESSING' }, 60);

    freeze(7_000_000 + RECOVERY_MS + 1);
    const first = await service.execute(key, 'fp-1', operation, undefined, RECOVERY_MS);

    expect(first).toEqual({ id: 'op-1' });
    expect(operation).toHaveBeenCalledTimes(1);
    expect((await store.get(STORAGE_KEY))?.status).toBe('COMPLETED');

    const replay = await service.execute(key, 'fp-1', operation, undefined, RECOVERY_MS);
    expect(replay).toEqual({ id: 'op-1' });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('caso 8.3 restart Redis: PROCESSING de worker morto é recuperado pelo novo processo', async () => {
    // Worker A reclama a entrada (PROCESSING persistido no Redis compartilhado)
    // e morre antes de persistir o resultado — simula crash comum a operações
    // comidempotência.
    const storeWorkerA = new RedisIdempotencyStore();
    const key = 'user-1:deposit:tx-restart';
    const storageKey = `backbet:idempotency:${key}`;

    freeze(8_000_000);
    await storeWorkerA.setIfAbsent(storageKey, { fingerprint: 'fp-1', status: 'PROCESSING' }, 60);

    // "Restart": novo processo/worker B com store próprio sobre o mesmo Redis,
    // após o limite de recuperação.
    freeze(8_000_000 + RECOVERY_MS + 1);
    const serviceB = new IdempotencyService(new RedisIdempotencyStore());
    const operationB = jest.fn().mockResolvedValue({ id: 'op-1' });
    const resultB = await serviceB.execute(key, 'fp-1', operationB, undefined, RECOVERY_MS);

    expect(resultB).toEqual({ id: 'op-1' });
    expect(operationB).toHaveBeenCalledTimes(1);
    const final = await new RedisIdempotencyStore().get<{ id: string }>(storageKey);
    expect(final?.status).toBe('COMPLETED');
    expect(final?.fingerprint).toBe('fp-1');
  });

  it('caso 8.3 dois workers: um processa; o outro recebe 409 e depois replay seguro', async () => {
    const key = 'user-1:deposit:tx-two-workers';
    const storageKey = `backbet:idempotency:${key}`;
    const storeA = new RedisIdempotencyStore();
    const storeB = new RedisIdempotencyStore();
    const serviceA = new IdempotencyService(storeA);
    const serviceB = new IdempotencyService(storeB);

    freeze(10_000_000);
    // Worker A ganha o claim (PROCESSING no Redis compartilhado).
    const claimed = await storeA.setIfAbsent(storageKey, { fingerprint: 'fp-1', status: 'PROCESSING' }, 60);
    expect(claimed).toBe(true);

    // Worker B, mesma chave, dentro do limite: a operação é única — B não
    // executa nada e recebe 409 (conflito) enquanto A está em processamento.
    await expect(
      serviceB.execute(key, 'fp-1', async () => ({ id: 'duplicado' }), undefined, RECOVERY_MS),
    ).rejects.toThrow(/já está em processamento/);

    // A conclui e persiste o resultado.
    await storeA.set(storageKey, { fingerprint: 'fp-1', status: 'COMPLETED', result: { id: 'op-1' } }, 60);

    // B reexecuta a mesma requisição (retry): replay seguro, sem duplicação.
    const replayB = await serviceB.execute(key, 'fp-1', async () => ({ id: 'duplicado' }), undefined, RECOVERY_MS);
    expect(replayB).toEqual({ id: 'op-1' });
  });
});