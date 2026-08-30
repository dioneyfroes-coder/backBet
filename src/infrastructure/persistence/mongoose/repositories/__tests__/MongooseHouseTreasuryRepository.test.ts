import { MongooseHouseTreasuryRepository } from '../MongooseHouseTreasuryRepository';
import { HouseTreasuryModel } from '../../schemas/TreasurySchema';
import { HouseWallet } from '@/core/treasury/domain/entities/HouseWallet';

const TREASURY_DOC = {
  _id: 'h-1',
  walletId: 'wallet-h',
  version: 1,
  currency: 'BRL',
  profitBalanceCents: 1000,
  prizeReserveBalanceCents: 500,
  ledger: [],
  updatedAt: new Date(),
};

const makeHouseWallet = (): HouseWallet => new HouseWallet('wallet-h', 'BRL', 1000, 500, [], 1);

const chain = (resolvedValue: unknown) => ({
  lean: jest.fn().mockResolvedValue(resolvedValue),
});

const rejectedChain = (error: Error) => ({
  lean: jest.fn().mockRejectedValue(error),
});

describe('MongooseHouseTreasuryRepository (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getById mapeia document para domínio', async () => {
    jest.spyOn(HouseTreasuryModel, 'findOne').mockReturnValue(chain(TREASURY_DOC) as never);

    const repo = new MongooseHouseTreasuryRepository();
    const wallet = await repo.getById('wallet-h');

    expect(wallet).not.toBeNull();
    expect(wallet?.id).toBe('wallet-h');
    expect(wallet?.profitBalance).toBe(10);
    expect(wallet?.prizeReserveBalance).toBe(5);
  });

  it('getById retorna null quando não existe', async () => {
    jest.spyOn(HouseTreasuryModel, 'findOne').mockReturnValue(chain(null) as never);

    const repo = new MongooseHouseTreasuryRepository();
    await expect(repo.getById('missing')).resolves.toBeNull();
  });

  describe('falha do banco vira AppError (code/message/status corretos)', () => {
    const dbError = new Error('db down');

    it('getById', async () => {
      jest.spyOn(HouseTreasuryModel, 'findOne').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseHouseTreasuryRepository();
      await expect(repo.getById('wallet-h')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar tesouraria',
        statusCode: 500,
      });
    });

    it('save', async () => {
      jest.spyOn(HouseTreasuryModel, 'findOneAndUpdate').mockRejectedValue(dbError);

      const repo = new MongooseHouseTreasuryRepository();
      await expect(repo.save(makeHouseWallet())).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao salvar tesouraria',
        statusCode: 500,
      });
    });

    it('update', async () => {
      jest.spyOn(HouseTreasuryModel, 'findOneAndUpdate').mockRejectedValue(dbError);

      const repo = new MongooseHouseTreasuryRepository();
      await expect(repo.update(makeHouseWallet())).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao atualizar tesouraria',
        statusCode: 500,
      });
    });

    it('update lança NOT_FOUND quando a tesouraria não existe', async () => {
      jest.spyOn(HouseTreasuryModel, 'findOneAndUpdate').mockResolvedValue(null as never);
      jest.spyOn(HouseTreasuryModel, 'exists').mockResolvedValue(false as never);

      const repo = new MongooseHouseTreasuryRepository();
      await expect(repo.update(makeHouseWallet())).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Tesouraria não encontrada',
        statusCode: 404,
      });
    });
  });
});