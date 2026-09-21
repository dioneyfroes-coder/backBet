import { MongooseLedgerRepository } from '../MongooseLedgerRepository';
import { LedgerEntryModel } from '../../schemas/LedgerEntrySchema';
import { LedgerEntry } from '@/core/finance/domain/entities/LedgerEntry';

const makeEntry = (): LedgerEntry =>
  new LedgerEntry(
    'tx-1',
    'user-1',
    'DEPOSIT',
    10000,
    'BRL',
    undefined,
    'PIX',
    'COMPLETED',
    new Date('2026-01-01T00:00:00.000Z'),
    undefined,
  );

describe('MongooseLedgerRepository (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('append usa findOneAndUpdate com upsert por transactionId (idempotente)', async () => {
    const spy = jest.spyOn(LedgerEntryModel, 'findOneAndUpdate').mockResolvedValue({} as never);

    const repo = new MongooseLedgerRepository();
    const entry = makeEntry();
    await expect(repo.append(entry)).resolves.toBe(entry);

    const [filter] = spy.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(filter).toEqual({ transactionId: 'tx-1' });
  });

  it('sumByTypes usa aggregation ($match + $group) em vez de somar no Node', async () => {
    const aggregateSpy = jest
      .spyOn(LedgerEntryModel, 'aggregate')
      .mockResolvedValue([{ total: 12345, totalCount: 3 }] as never);
    const findSpy = jest.spyOn(LedgerEntryModel, 'find');

    const repo = new MongooseLedgerRepository();
    const result = await repo.sumByTypes('user-1', ['DEPOSIT'], {
      from: new Date('2026-01-01T00:00:00.000Z'),
      statuses: ['COMPLETED'],
    });

    expect(result).toEqual({ amountCents: 12345, count: 3 });
    expect(findSpy).not.toHaveBeenCalled();

    const pipeline = aggregateSpy.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
    expect(pipeline[0]).toEqual({
      $match: {
        userId: 'user-1',
        type: { $in: ['DEPOSIT'] },
        createdAt: { $gte: new Date('2026-01-01T00:00:00.000Z') },
        status: { $in: ['COMPLETED'] },
      },
    });
    expect(pipeline[1]).toEqual({
      $group: { _id: null, total: { $sum: '$amountCents' }, totalCount: { $sum: 1 } },
    });
  });

  it('sumByTypes devolve zeros quando a agregação não retorna linhas', async () => {
    jest.spyOn(LedgerEntryModel, 'aggregate').mockResolvedValue([] as never);

    const repo = new MongooseLedgerRepository();
    await expect(repo.sumByTypes('user-1', ['DEPOSIT'])).resolves.toEqual({
      amountCents: 0,
      count: 0,
    });
  });

  describe('falha do banco vira AppError (code/message/status corretos)', () => {
    it('append', async () => {
      jest.spyOn(LedgerEntryModel, 'findOneAndUpdate').mockRejectedValue(new Error('db down'));

      const repo = new MongooseLedgerRepository();
      await expect(repo.append(makeEntry())).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao registrar entrada de ledger',
        statusCode: 500,
      });
    });
  });
});