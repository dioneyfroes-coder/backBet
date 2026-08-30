import { MongooseWalletRepository } from '../MongooseWalletRepository';
import { WalletModel } from '../../schemas/WalletSchema';
import { Wallet } from '@/core/finance/domain/entities/Wallet';

const WALLET_DOC = {
  _id: 'w-1',
  userId: 'user-1',
  version: 1,
  balanceCents: 1000,
  lockedBalanceCents: 0,
  currency: 'BRL',
  transactions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makeWallet = (): Wallet => {
  const wallet = new Wallet('user-1', 'BRL');
  wallet.deposit(10);
  return wallet;
};

const chain = (resolvedValue: unknown) => ({
  lean: jest.fn().mockResolvedValue(resolvedValue),
});

const rejectedChain = (error: Error) => ({
  lean: jest.fn().mockRejectedValue(error),
});

describe('MongooseWalletRepository (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('findByUserId mapeia document para domínio', async () => {
    jest.spyOn(WalletModel, 'findOne').mockReturnValue(chain(WALLET_DOC) as never);

    const repo = new MongooseWalletRepository();
    const wallet = await repo.findByUserId('user-1');

    expect(wallet).not.toBeNull();
    expect(wallet?.userId).toBe('user-1');
    expect(wallet?.balance).toBe(10);
    expect(wallet?.currency).toBe('BRL');
  });

  it('findByUserId retorna null quando não existe', async () => {
    jest.spyOn(WalletModel, 'findOne').mockReturnValue(chain(null) as never);

    const repo = new MongooseWalletRepository();
    await expect(repo.findByUserId('missing')).resolves.toBeNull();
  });

  describe('falha do banco vira AppError (code/message/status corretos)', () => {
    const dbError = new Error('db down');

    it('save', async () => {
      jest.spyOn(WalletModel, 'findOneAndUpdate').mockRejectedValue(dbError);

      const repo = new MongooseWalletRepository();
      await expect(repo.save(makeWallet())).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao salvar carteira',
        statusCode: 500,
      });
    });

    it('save lança CONFLICT em chave duplicada (Mongo error 11000)', async () => {
      const duplicate = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      jest.spyOn(WalletModel, 'findOneAndUpdate').mockRejectedValue(duplicate);

      const repo = new MongooseWalletRepository();
      await expect(repo.save(makeWallet())).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Uma carteira para este usuário já existe',
        statusCode: 409,
      });
    });

    it('findByUserId', async () => {
      jest.spyOn(WalletModel, 'findOne').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseWalletRepository();
      await expect(repo.findByUserId('user-1')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar carteira',
        statusCode: 500,
      });
    });

    it('update', async () => {
      jest.spyOn(WalletModel, 'findOneAndUpdate').mockRejectedValue(dbError);

      const repo = new MongooseWalletRepository();
      await expect(repo.update(makeWallet())).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao atualizar carteira',
        statusCode: 500,
      });
    });

    it('update lança NOT_FOUND quando a carteira não existe', async () => {
      jest.spyOn(WalletModel, 'findOneAndUpdate').mockResolvedValue(null as never);
      jest.spyOn(WalletModel, 'exists').mockResolvedValue(false as never);

      const repo = new MongooseWalletRepository();
      await expect(repo.update(makeWallet())).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Carteira não encontrada',
        statusCode: 404,
      });
    });

    it('delete', async () => {
      jest.spyOn(WalletModel, 'findOneAndDelete').mockRejectedValue(dbError);

      const repo = new MongooseWalletRepository();
      await expect(repo.delete('user-1')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao deletar carteira',
        statusCode: 500,
      });
    });

    it('getHistory', async () => {
      jest.spyOn(WalletModel, 'findOne').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseWalletRepository();
      await expect(repo.getHistory('user-1')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar histórico de transações',
        statusCode: 500,
      });
    });

    it('getHistory lança NOT_FOUND quando a carteira não existe', async () => {
      jest.spyOn(WalletModel, 'findOne').mockReturnValue(chain(null) as never);

      const repo = new MongooseWalletRepository();
      await expect(repo.getHistory('user-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Carteira não encontrada',
        statusCode: 404,
      });
    });
  });
});