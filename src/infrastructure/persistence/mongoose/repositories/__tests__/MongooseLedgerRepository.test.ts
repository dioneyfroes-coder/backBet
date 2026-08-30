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