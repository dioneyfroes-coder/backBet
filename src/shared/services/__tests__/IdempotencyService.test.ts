import { IdempotencyService, InMemoryIdempotencyStore } from '../IdempotencyService';

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