import { MongooseBetRepository } from '../MongooseBetRepository';
import { BetModel } from '../../schemas/BetSchema';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@core/odds/domain/value-objects/Odds';

const makeBet = (): Bet =>
  new Bet(
    'bet-a',
    'user-a',
    'event-a',
    'market-a',
    new Money(10, 'BRL'),
    new Odds(1.5),
    'PENDING',
    'SINGLE',
    new Date(),
    new Date(0),
    '',
  );

const BET_DOC = {
  _id: 'bet-a',
  userId: 'user-a',
  eventId: 'event-a',
  marketId: 'market-a',
  oddId: 'odd-home',
  amountCents: 1000,
  odds: 1.5,
  potentialReturnCents: 1500,
  status: 'PENDING',
  type: 'SINGLE',
  currency: 'BRL',
  createdAt: new Date(),
  resolvedAt: null,
  cancellationReason: '',
  version: 1,
};

const chain = (resolvedValue: unknown) => ({
  lean: jest.fn().mockResolvedValue(resolvedValue),
});

const rejectedChain = (error: Error) => ({
  lean: jest.fn().mockRejectedValue(error),
});

describe('MongooseBetRepository (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('findById mapeia document para domínio', async () => {
    jest.spyOn(BetModel, 'findById').mockReturnValue(chain(BET_DOC) as never);

    const repo = new MongooseBetRepository();
    const bet = await repo.findById('bet-a');

    expect(bet).not.toBeNull();
    expect(bet?.id).toBe('bet-a');
    expect(bet?.status).toBe('PENDING');
    expect(bet?.odds.value).toBe(1.5);
  });

  it('findById retorna null quando não existe', async () => {
    jest.spyOn(BetModel, 'findById').mockReturnValue(chain(null) as never);

    const repo = new MongooseBetRepository();
    await expect(repo.findById('missing')).resolves.toBeNull();
  });

  it('exists reflete a presença do document', async () => {
    jest.spyOn(BetModel, 'findById').mockReturnValue(chain(BET_DOC) as never);

    const repo = new MongooseBetRepository();
    await expect(repo.exists('bet-a')).resolves.toBe(true);
  });

  describe('falha do banco vira AppError (code/message/status corretos)', () => {
    const dbError = new Error('db down');

    it('create', async () => {
      jest.spyOn(BetModel.prototype, 'save').mockRejectedValue(dbError);

      const repo = new MongooseBetRepository();
      await expect(repo.create(makeBet())).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao criar aposta',
        statusCode: 500,
      });
    });

    it('update', async () => {
      jest.spyOn(BetModel, 'findOneAndUpdate').mockRejectedValue(dbError);

      const repo = new MongooseBetRepository();
      await expect(repo.update(makeBet())).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao atualizar aposta',
        statusCode: 500,
      });
    });

    it('update lança NOT_FOUND quando a aposta não existe', async () => {
      jest.spyOn(BetModel, 'findOneAndUpdate').mockResolvedValue(null as never);
      jest.spyOn(BetModel, 'exists').mockResolvedValue(false as never);

      const repo = new MongooseBetRepository();
      await expect(repo.update(makeBet())).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Aposta não encontrada',
        statusCode: 404,
      });
    });

    it('create propaga erro transiente (WriteConflict) intacto para o driver repetir a transação', async () => {
      const writeConflict = Object.assign(new Error('Write conflict'), {
        code: 112,
        codeName: 'WriteConflict',
        errorLabels: ['TransientTransactionError'],
      });
      jest.spyOn(BetModel.prototype, 'save').mockRejectedValue(writeConflict);

      const repo = new MongooseBetRepository();
      await expect(repo.create(makeBet())).rejects.toBe(writeConflict);
    });

    it('update propaga erro transiente (WriteConflict) intacto', async () => {
      const writeConflict = Object.assign(new Error('Write conflict'), {
        code: 112,
        codeName: 'WriteConflict',
        errorLabels: ['TransientTransactionError'],
      });
      jest.spyOn(BetModel, 'findOneAndUpdate').mockRejectedValue(writeConflict);

      const repo = new MongooseBetRepository();
      await expect(repo.update(makeBet())).rejects.toBe(writeConflict);
    });

    it('findById', async () => {
      jest.spyOn(BetModel, 'findById').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.findById('bet-a')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar aposta',
        statusCode: 500,
      });
    });

    it('findByUserId', async () => {
      jest.spyOn(BetModel, 'find').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.findByUserId('user-a')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar apostas do usuário',
        statusCode: 500,
      });
    });

    it('findByEventId', async () => {
      jest.spyOn(BetModel, 'find').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.findByEventId('event-a')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar apostas do evento',
        statusCode: 500,
      });
    });

    it('findByMarketId', async () => {
      jest.spyOn(BetModel, 'find').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.findByMarketId('market-a')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar apostas do mercado',
        statusCode: 500,
      });
    });

    it('findByStatus', async () => {
      jest.spyOn(BetModel, 'find').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.findByStatus('PENDING')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar apostas por status',
        statusCode: 500,
      });
    });

    it('findAll', async () => {
      jest.spyOn(BetModel, 'find').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.findAll()).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao listar apostas',
        statusCode: 500,
      });
    });

    it('exists', async () => {
      jest.spyOn(BetModel, 'findById').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.exists('bet-a')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao verificar aposta',
        statusCode: 500,
      });
    });

    it('delete', async () => {
      jest.spyOn(BetModel, 'findByIdAndDelete').mockRejectedValue(dbError);

      const repo = new MongooseBetRepository();
      await expect(repo.delete('bet-a')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao deletar aposta',
        statusCode: 500,
      });
    });
  });
});

describe('MongooseBetRepository — cobertura adicional (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('caminhos felizes', () => {
    it('create persiste o documento', async () => {
      jest.spyOn(BetModel.prototype, 'save').mockResolvedValue(undefined as never);

      const repo = new MongooseBetRepository();
      await expect(repo.create(makeBet())).resolves.toBeUndefined();
    });

    it('update com versão correta atualiza e repassa session', async () => {
      const query = { session: jest.fn().mockReturnThis() } as any;
      jest.spyOn(BetModel, 'findOneAndUpdate').mockReturnValue(query as never);

      const repo = new MongooseBetRepository();
      await expect(repo.update(makeBet(), { session: 's-custom' } as any)).resolves.toBeUndefined();
      expect(query.session).toHaveBeenCalledWith('s-custom');
    });

    it('findById mapeia quando session é repassada', async () => {
      const query = {
        session: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(BET_DOC),
      } as any;
      jest.spyOn(BetModel, 'findById').mockReturnValue(query as never);

      const repo = new MongooseBetRepository();
      const bet = await repo.findById('bet-a', { session: 's' } as any);
      expect(query.session).toHaveBeenCalledWith('s');
      expect(bet?.id).toBe('bet-a');
    });

    it('findByUserId mapeia documentos', async () => {
      jest.spyOn(BetModel, 'find').mockReturnValue(chain([BET_DOC]) as never);

      const repo = new MongooseBetRepository();
      const bets = await repo.findByUserId('user-a');
      expect(bets).toHaveLength(1);
      expect(bets[0].id).toBe('bet-a');
    });

    it('findByEventId mapeia documentos', async () => {
      jest.spyOn(BetModel, 'find').mockReturnValue(chain([BET_DOC]) as never);

      const repo = new MongooseBetRepository();
      const bets = await repo.findByEventId('event-a');
      expect(bets).toHaveLength(1);
      expect(bets[0].id).toBe('bet-a');
    });

    it('findByMarketId mapeia documentos', async () => {
      jest.spyOn(BetModel, 'find').mockReturnValue(chain([BET_DOC]) as never);

      const repo = new MongooseBetRepository();
      const bets = await repo.findByMarketId('market-a');
      expect(bets).toHaveLength(1);
      expect(bets[0].id).toBe('bet-a');
    });

    it('findByStatus mapeia documentos', async () => {
      jest.spyOn(BetModel, 'find').mockReturnValue(chain([BET_DOC]) as never);

      const repo = new MongooseBetRepository();
      const bets = await repo.findByStatus('PENDING');
      expect(bets).toHaveLength(1);
      expect(bets[0].status).toBe('PENDING');
    });

    it('findAll aplica filtro e mapeia', async () => {
      const find = jest.fn().mockReturnValue(chain([BET_DOC]));
      jest.spyOn(BetModel, 'find').mockImplementation(find as never);

      const repo = new MongooseBetRepository();
      const bets = await repo.findAll({ userId: 'user-a', eventId: 'event-a', status: 'PENDING' });
      expect(find).toHaveBeenCalledWith({ userId: 'user-a', eventId: 'event-a', status: 'PENDING' });
      expect(bets).toHaveLength(1);
    });

    it('findAll sem filtro usa query vazio', async () => {
      jest.spyOn(BetModel, 'find').mockReturnValue(chain([BET_DOC]) as never);

      const repo = new MongooseBetRepository();
      await repo.findAll();
      expect(BetModel.find).toHaveBeenCalledWith({});
    });

    it('exists retorna false quando não há documento', async () => {
      jest.spyOn(BetModel, 'findById').mockReturnValue(chain(null) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.exists('missing')).resolves.toBe(false);
    });

    it('delete remove e retorna true', async () => {
      jest.spyOn(BetModel, 'findByIdAndDelete').mockResolvedValue(BET_DOC as never);

      const repo = new MongooseBetRepository();
      await expect(repo.delete('bet-a')).resolves.toBe(true);
    });

    it('delete retorna false quando não existe', async () => {
      jest.spyOn(BetModel, 'findByIdAndDelete').mockResolvedValue(null as never);

      const repo = new MongooseBetRepository();
      await expect(repo.delete('missing')).resolves.toBe(false);
    });
  });

  it('update lança CONFLICT quando a versão diverge (aposta existe)', async () => {
    jest.spyOn(BetModel, 'findOneAndUpdate').mockResolvedValue(null as never);
    jest.spyOn(BetModel, 'exists').mockResolvedValue(true as never);

    const repo = new MongooseBetRepository();
    await expect(repo.update(makeBet())).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Conflito de concorrência ao atualizar aposta',
      statusCode: 409,
      details: { betId: 'bet-a', expectedVersion: 0 },
    });
  });

  describe('erros transientes (WriteConflict) passam intactos nas buscas', () => {
    const transient = () =>
      Object.assign(new Error('Write conflict'), {
        code: 112,
        codeName: 'WriteConflict',
        errorLabels: ['TransientTransactionError'],
      });

    it('findById', async () => {
      const err = transient();
      jest.spyOn(BetModel, 'findById').mockReturnValue(rejectedChain(err) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.findById('bet-a')).rejects.toBe(err);
    });

    it('findByUserId', async () => {
      const err = transient();
      jest.spyOn(BetModel, 'find').mockReturnValue(rejectedChain(err) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.findByUserId('user-a')).rejects.toBe(err);
    });

    it('findByEventId', async () => {
      const err = transient();
      jest.spyOn(BetModel, 'find').mockReturnValue(rejectedChain(err) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.findByEventId('event-a')).rejects.toBe(err);
    });

    it('findByMarketId', async () => {
      const err = transient();
      jest.spyOn(BetModel, 'find').mockReturnValue(rejectedChain(err) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.findByMarketId('market-a')).rejects.toBe(err);
    });

    it('findByStatus', async () => {
      const err = transient();
      jest.spyOn(BetModel, 'find').mockReturnValue(rejectedChain(err) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.findByStatus('PENDING')).rejects.toBe(err);
    });

    it('findAll', async () => {
      const err = transient();
      jest.spyOn(BetModel, 'find').mockReturnValue(rejectedChain(err) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.findAll({ eventId: 'event-a' })).rejects.toBe(err);
    });

    it('exists', async () => {
      const err = transient();
      jest.spyOn(BetModel, 'findById').mockReturnValue(rejectedChain(err) as never);

      const repo = new MongooseBetRepository();
      await expect(repo.exists('bet-a')).rejects.toBe(err);
    });

    it('delete', async () => {
      const err = transient();
      jest.spyOn(BetModel, 'findByIdAndDelete').mockRejectedValue(err);

      const repo = new MongooseBetRepository();
      await expect(repo.delete('bet-a')).rejects.toBe(err);
    });
  });
});