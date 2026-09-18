import { IdempotencyService, InMemoryIdempotencyStore, RedisIdempotencyStore } from '../IdempotencyService';
import { redisClient } from '@/infrastructure/cache/RedisClient';

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

describe('IdempotencyService', () => {
  const createService = () => new IdempotencyService(new InMemoryIdempotencyStore());

  it('returns the completed result without running the operation twice', async () => {
    const service = createService();
    const operation = jest.fn().mockResolvedValue({ transactionId: 'tx-1' });

    await expect(service.execute('key-1', 'payload-1', operation)).resolves.toEqual({
      transactionId: 'tx-1',
    });
    await expect(service.execute('key-1', 'payload-1', operation)).resolves.toEqual({
      transactionId: 'tx-1',
    });

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse with a different payload', async () => {
    const service = createService();

    await service.execute('key-1', 'payload-1', async () => 'done');

    await expect(service.execute('key-1', 'payload-2', async () => 'other')).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });

  it('rejects concurrent processing for the same key', async () => {
    const service = createService();
    let release!: () => void;
    const operation = () =>
      new Promise<string>((resolve) => {
        release = () => resolve('done');
      });

    const first = service.execute('key-1', 'payload-1', operation);
    await expect(service.execute('key-1', 'payload-1', async () => 'other')).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
    release();
    await expect(first).resolves.toBe('done');
  });

  it('treats an expired/lost-response retry as a replay when the result is durable', async () => {
    // Simula "request A depois de resposta perdida / após timeout": a resposta
    // original foi gravada (COMPLETED) e, no retry, é devolvida sem re-executar.
    const store = new InMemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    const operation = jest.fn().mockResolvedValue({ id: 'op-1' });
    const key = 'user-1:deposit:tx-1';

    await service.execute(key, 'fingerprint-1', operation);
    // dado que o cliente não recebeu a resposta, repete a mesma requisição
    await service.execute(key, 'fingerprint-1', operation);

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('replays COMPLETED void operations (ex.: payout/contact worker)', async () => {
    // Operações que resolvem `undefined` (Promise<void>) não persistiam replay:
    // o retry da mesma entrega com a mesma chave caía em 409 espúrio. A operação
    // deve ser executada 1x e o retry deve resolver undefined sem re-executar.
    const service = createService();
    const operation = jest.fn().mockResolvedValue(undefined);

    await expect(service.execute('withdrawal-payout:x', 'fp-1', operation)).resolves.toBeUndefined();
    await expect(service.execute('withdrawal-payout:x', 'fp-1', operation)).resolves.toBeUndefined();

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('replays COMPLETED void via executeWithMeta marcando replayed', async () => {
    const service = createService();
    const operation = jest.fn().mockResolvedValue(undefined);

    const first = await service.executeWithMeta('contact-email:ticket-1', 'fp-1', operation);
    const replay = await service.executeWithMeta('contact-email:ticket-1', 'fp-1', operation);

    expect(first).toEqual({ value: undefined, replayed: false });
    expect(replay).toEqual({ value: undefined, replayed: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('restoreResult rehydrates the replayed result into a domain entity', async () => {
    const service = createService();
    type RawBet = { id: string; status: string };
    const raw: RawBet = { id: 'bet-1', status: 'WON' };
    const operation = jest.fn<Promise<RawBet>, []>().mockResolvedValue(raw);
    const key = 'bet-1:bet-settle:req-1';
    const fingerprint = JSON.stringify({ betId: 'bet-1' });
    const restore = (r: RawBet) => ({ ...r, rehydrated: true });

    const first = await service.execute(key, fingerprint, operation, restore);
    // the first execution returns the raw operation result
    expect(first).toEqual({ id: 'bet-1', status: 'WON' });

    const replay = await service.execute(key, fingerprint, operation, restore);
    expect(operation).toHaveBeenCalledTimes(1);
    // the replay is rehydrated through restoreResult
    expect(replay).toEqual({ id: 'bet-1', status: 'WON', rehydrated: true });
  });

  it('rejects an empty Idempotency-Key as invalid', async () => {
    const service = createService();
    await expect(service.execute('   ', 'fp', async () => 'x')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('executeWithMeta flags replays while honoring execute as the plain contract', async () => {
    const service = createService();
    const operation = jest.fn(async () => 'result-1');
    const key = 'user-1:withdraw:req-1';
    const fingerprint = JSON.stringify({ amount: 10 });

    const first = await service.executeWithMeta(key, fingerprint, operation);
    const replay = await service.executeWithMeta(key, fingerprint, operation);

    expect(first).toEqual({ value: 'result-1', replayed: false });
    expect(replay).toEqual({ value: 'result-1', replayed: true });
    expect(operation).toHaveBeenCalledTimes(1);

    const plain = await service.execute(key, fingerprint, async () => 'other');
    expect(plain).toBe('result-1');
  });
});

describe('IdempotencyService — recuperação de PROCESSING abandonado', () => {
  const RECOVERY_MS = 5 * 60 * 1000;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function freeze(ms: number): void {
    jest.spyOn(Date, 'now').mockReturnValue(ms);
  }

  it('recupera PROCESSING parado além do limite e completa a operação', async () => {
    const store = new InMemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    const operation = jest.fn().mockResolvedValue({ id: 'op-1' });
    const key = 'user-1:deposit:tx-1';
    const storageKey = `backbet:idempotency:${key}`;

    freeze(1_000_000);
    await store.setIfAbsent(storageKey, { fingerprint: 'fp-1', status: 'PROCESSING' }, 60);

    freeze(1_000_000 + RECOVERY_MS + 1);
    const first = await service.execute(key, 'fp-1', operation, undefined, RECOVERY_MS);

    expect(first).toEqual({ id: 'op-1' });
    expect(operation).toHaveBeenCalledTimes(1);
    expect((await store.get<{ id: string }>(storageKey))?.status).toBe('COMPLETED');

    const replay = await service.execute(key, 'fp-1', operation, undefined, RECOVERY_MS);
    expect(replay).toEqual({ id: 'op-1' });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('não recupera PROCESSING ainda dentro do limite (CONFLICT mantido)', async () => {
    const store = new InMemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    const operation = jest.fn().mockResolvedValue('done');
    const key = 'user-1:withdraw:req-1';
    const storageKey = `backbet:idempotency:${key}`;

    freeze(2_000_000);
    await store.setIfAbsent(storageKey, { fingerprint: 'fp-1', status: 'PROCESSING' }, 60);

    freeze(2_000_000 + RECOVERY_MS - 1000);
    await expect(
      service.execute(key, 'fp-1', operation, undefined, RECOVERY_MS),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    expect(operation).not.toHaveBeenCalled();
  });

  it('sem recoveryMs o comportamento padrão é CONFLICT para PROCESSING', async () => {
    const store = new InMemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    const operation = jest.fn().mockResolvedValue('done');
    const key = 'user-1:bet:req-1';
    const storageKey = `backbet:idempotency:${key}`;

    freeze(3_000_000);
    await store.setIfAbsent(storageKey, { fingerprint: 'fp-1', status: 'PROCESSING' }, 60);

    freeze(3_000_000 + RECOVERY_MS + 1);
    await expect(service.execute(key, 'fp-1', operation)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it('nunca re-executa uma entrada COMPLETED, mesmo antiga', async () => {
    const store = new InMemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    const operation = jest.fn().mockResolvedValue({ id: 'op-1' });
    const key = 'user-1:deposit:tx-2';
    const storageKey = `backbet:idempotency:${key}`;

    freeze(4_000_000);
    await store.setIfAbsent(storageKey, { fingerprint: 'fp-1', status: 'PROCESSING' }, 60);
    await store.set(storageKey, { fingerprint: 'fp-1', status: 'COMPLETED', result: { id: 'op-1' } }, 60);

    freeze(4_000_000 + RECOVERY_MS + 1);
    await service.execute(key, 'fp-1', operation, undefined, RECOVERY_MS);

    expect(operation).not.toHaveBeenCalled();
  });
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