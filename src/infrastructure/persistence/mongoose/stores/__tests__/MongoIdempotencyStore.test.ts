import { MongoIdempotencyStore } from '../MongoIdempotencyStore';
import { IdempotencyEntryModel } from '../../schemas/IdempotencyEntrySchema';

describe('MongoIdempotencyStore (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('get returns null when no record exists', async () => {
    jest.spyOn(IdempotencyEntryModel, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as any);
    jest.spyOn(IdempotencyEntryModel, 'init').mockResolvedValue(undefined as any);

    const store = new MongoIdempotencyStore();
    expect(await store.get('k1')).toBeNull();
  });

  it('get maps a stored record', async () => {
    jest.spyOn(IdempotencyEntryModel, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        key: 'backbet:idempotency:k1',
        fingerprint: 'fp-1',
        status: 'COMPLETED',
        result: { id: 'x' },
      }),
    } as any);
    jest.spyOn(IdempotencyEntryModel, 'init').mockResolvedValue(undefined as any);

    const store = new MongoIdempotencyStore();
    const rec = await store.get<{ id: string }>('backbet:idempotency:k1');
    expect(rec?.fingerprint).toBe('fp-1');
    expect(rec?.status).toBe('COMPLETED');
    expect(rec?.result?.id).toBe('x');
  });

  it('setIfAbsent claims when the upsert inserted a new record', async () => {
    const updateSpy = jest
      .spyOn(IdempotencyEntryModel, 'findOneAndUpdate')
      .mockResolvedValue({ lastErrorObject: { updatedExisting: false } } as any);
    jest.spyOn(IdempotencyEntryModel, 'init').mockResolvedValue(undefined as any);

    const store = new MongoIdempotencyStore();
    const claimed = await store.setIfAbsent('k1', { fingerprint: 'fp', status: 'PROCESSING' }, 60);

    expect(claimed).toBe(true);
    const [, data] = updateSpy.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    const setOnInsert = data.$setOnInsert as Record<string, unknown>;
    expect(setOnInsert.processingAt).toBeInstanceOf(Date);
    expect(setOnInsert.key).toBe('k1');
  });

  it('setIfAbsent does not claim when the record already exists', async () => {
    jest.spyOn(IdempotencyEntryModel, 'findOneAndUpdate').mockResolvedValue({
      lastErrorObject: { updatedExisting: true },
    } as any);
    jest.spyOn(IdempotencyEntryModel, 'init').mockResolvedValue(undefined as any);

    const store = new MongoIdempotencyStore();
    const claimed = await store.setIfAbsent('k1', { fingerprint: 'fp', status: 'PROCESSING' }, 60);
    expect(claimed).toBe(false);
  });

  it('set persists the completed record refreshing processingAt and delete removes it', async () => {
    const updateOne = jest.spyOn(IdempotencyEntryModel, 'updateOne').mockResolvedValue({} as any);
    const deleteOne = jest.spyOn(IdempotencyEntryModel, 'deleteOne').mockResolvedValue({} as any);
    jest.spyOn(IdempotencyEntryModel, 'init').mockResolvedValue(undefined as any);

    const store = new MongoIdempotencyStore();
    await store.set('k1', { fingerprint: 'fp', status: 'COMPLETED', result: 1 }, 60);
    await store.delete('k1');

    const [, data] = updateOne.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect((data.$set as Record<string, unknown>).processingAt).toBeInstanceOf(Date);
    expect(deleteOne).toHaveBeenCalledWith({ key: 'k1' });
  });

  it('reclaimStaleProcessing reclama apenas PROCESSING parado além do cutoff', async () => {
    const updateSpy = jest
      .spyOn(IdempotencyEntryModel, 'findOneAndUpdate')
      .mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          key: 'k1',
          fingerprint: 'fp',
          status: 'PROCESSING',
          result: undefined,
        }),
      } as any);
    jest.spyOn(IdempotencyEntryModel, 'init').mockResolvedValue(undefined as any);

    const store = new MongoIdempotencyStore();
    const rec = await store.reclaimStaleProcessing<{ a: number }>('k1', 300_000);

    expect(rec?.status).toBe('PROCESSING');
    expect(rec?.fingerprint).toBe('fp');
    const [filter, data] = updateSpy.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(filter.key).toBe('k1');
    expect(filter.status).toBe('PROCESSING');
    expect((filter.processingAt as Record<string, Date>).$lt).toBeInstanceOf(Date);
    expect((data.$set as Record<string, Date>).processingAt).toBeInstanceOf(Date);
  });

  it('reclaimStaleProcessing retorna null quando não existe entrada recuperável', async () => {
    jest.spyOn(IdempotencyEntryModel, 'findOneAndUpdate').mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    } as any);
    jest.spyOn(IdempotencyEntryModel, 'init').mockResolvedValue(undefined as any);

    const store = new MongoIdempotencyStore();
    await expect(store.reclaimStaleProcessing('k1', 300_000)).resolves.toBeNull();
  });
});
