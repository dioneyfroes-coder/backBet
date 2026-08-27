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
    jest.spyOn(IdempotencyEntryModel, 'findOneAndUpdate').mockResolvedValue({
      lastErrorObject: { updatedExisting: false },
    } as any);
    jest.spyOn(IdempotencyEntryModel, 'init').mockResolvedValue(undefined as any);

    const store = new MongoIdempotencyStore();
    const claimed = await store.setIfAbsent('k1', { fingerprint: 'fp', status: 'PROCESSING' }, 60);
    expect(claimed).toBe(true);
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

  it('set persists the completed record and delete removes it', async () => {
    const updateOne = jest.spyOn(IdempotencyEntryModel, 'updateOne').mockResolvedValue({} as any);
    const deleteOne = jest.spyOn(IdempotencyEntryModel, 'deleteOne').mockResolvedValue({} as any);
    jest.spyOn(IdempotencyEntryModel, 'init').mockResolvedValue(undefined as any);

    const store = new MongoIdempotencyStore();
    await store.set('k1', { fingerprint: 'fp', status: 'COMPLETED', result: 1 }, 60);
    await store.delete('k1');

    expect(updateOne).toHaveBeenCalled();
    expect(deleteOne).toHaveBeenCalledWith({ key: 'k1' });
  });
});
