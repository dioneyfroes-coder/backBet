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
});