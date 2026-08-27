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
});