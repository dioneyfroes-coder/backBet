import { MongooseEventRepository } from '../MongooseEventRepository';
import { EventModel } from '../../schemas/EventSchema';
import { Event, Market } from '@/core/betting/domain/entities/Event';
import { Odds } from '@core/odds/domain/value-objects/Odds';

const FOOTBALL_EVENT = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function makeEventDomain(): Event {
  return new Event(
    FOOTBALL_EVENT,
    'FC Tech vs Dev United',
    new Date('2026-09-01T12:00:00Z'),
    'SCHEDULED',
    'Football',
    ['FC Tech', 'Dev United'],
    new Map([
      [
        'mkt-1x2',
        new Market(
          'mkt-1x2',
          'Resultado Final',
          'OPEN',
          new Map([
            ['home', new Odds(1.9)],
            ['draw', new Odds(3.1)],
            ['away', new Odds(3.6)],
          ]),
        ),
      ],
    ]),
  );
}

const makeDoc = () => ({
  id: FOOTBALL_EVENT,
  name: 'FC Tech vs Dev United',
  category: 'Football',
  startDate: new Date('2026-09-01T12:00:00Z'),
  status: 'SCHEDULED',
  participants: ['FC Tech', 'Dev United'],
  markets: [
    {
      id: 'mkt-1x2',
      name: 'Resultado Final',
      status: 'OPEN',
      result: null,
      odds: [
        { id: 'home', value: 1.9 },
        { id: 'draw', value: 3.1 },
        { id: 'away', value: 3.6 },
      ],
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const chain = (resolvedValue: unknown) => ({
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(resolvedValue),
});

const rejectedChain = (error: Error) => ({
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockRejectedValue(error),
});

describe('MongooseEventRepository (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('semear eventos de exemplo uma vez quando a coleção está vazia (mesmo catálogo do in-memory)', async () => {
    const countSpy = jest.spyOn(EventModel, 'estimatedDocumentCount').mockResolvedValue(0);
    const bulkWriteSpy = jest.spyOn(EventModel, 'bulkWrite').mockResolvedValue({} as never);
    jest.spyOn(EventModel, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue(makeDoc()),
    } as never);

    const repo = new MongooseEventRepository();
    const event = await repo.findById(FOOTBALL_EVENT);

    expect(countSpy).toHaveBeenCalledTimes(1);
    expect(bulkWriteSpy).toHaveBeenCalledTimes(1);
    const ops = bulkWriteSpy.mock.calls[0][0] as unknown as Array<{
      updateOne: { filter: { id: string } };
    }>;
    expect(ops).toHaveLength(3);
    expect(ops[0].updateOne.filter.id).toBe(FOOTBALL_EVENT);
    expect(event?.name).toBe('FC Tech vs Dev United');
    expect(event?.markets.get('mkt-1x2')?.odds.get('home')?.value).toBe(1.9);
  });

  it('findById mapeia document para domínio (markets e odds preservados)', async () => {
    jest.spyOn(EventModel, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue(makeDoc()),
    } as never);

    const repo = new MongooseEventRepository();
    const event = await repo.findById(FOOTBALL_EVENT);

    expect(event).not.toBeNull();
    expect(event?.id).toBe(FOOTBALL_EVENT);
    expect(event?.status).toBe('SCHEDULED');
    expect(event?.category).toBe('Football');
    expect(event?.participants).toEqual(['FC Tech', 'Dev United']);
    const market = event?.markets.get('mkt-1x2');
    expect(market?.status).toBe('OPEN');
    expect(Array.from(market?.odds.keys() ?? [])).toEqual(['home', 'draw', 'away']);
  });

  it('findById retorna null quando não existe', async () => {
    jest.spyOn(EventModel, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    } as never);

    const repo = new MongooseEventRepository();
    await expect(repo.findById('missing')).resolves.toBeNull();
  });

  it('create usa findOneAndUpdate com upsert por id (idempotente)', async () => {
    const spy = jest.spyOn(EventModel, 'findOneAndUpdate').mockResolvedValue(makeDoc() as never);

    const repo = new MongooseEventRepository();
    const event = makeEventDomain();
    await repo.create(event);

    expect(spy).toHaveBeenCalledTimes(1);
    const [filter, , options] = spy.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ id: FOOTBALL_EVENT });
    expect(options).toMatchObject({ upsert: true });
  });

  it('update altera status e persiste com o mesmo id', async () => {
    const spy = jest.spyOn(EventModel, 'findOneAndUpdate').mockResolvedValue({
      ...makeDoc(),
      status: 'LIVE',
    } as never);

    const repo = new MongooseEventRepository();
    const event = makeEventDomain();
    event.start();
    await repo.update(event);

    const [filter, data] = spy.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(filter).toEqual({ id: FOOTBALL_EVENT });
    expect(data).toMatchObject({ id: FOOTBALL_EVENT, status: 'LIVE' });
  });

  it('update lança NOT_FOUND quando o evento não existe', async () => {
    jest.spyOn(EventModel, 'findOneAndUpdate').mockResolvedValue(null as never);

    const repo = new MongooseEventRepository();
    await expect(repo.update(makeEventDomain())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('findAll aplica filtros de status/categoria/intervalo e ordena por startDate', async () => {
    jest.spyOn(EventModel, 'find').mockReturnValue(chain([makeDoc()]) as never);

    const repo = new MongooseEventRepository();
    const events = await repo.findAll({ status: 'SCHEDULED', category: 'Football' });
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('Football');

    await repo.findAll({ dateFrom: new Date(), dateTo: new Date('2027-01-01') });
    const queryArgs = (EventModel.find as jest.Mock).mock.calls[0][0];
    expect(queryArgs).toEqual({ status: 'SCHEDULED', category: 'Football' });
  });

  it('findUpcoming filtra SCHEDULED no futuro', async () => {
    jest.spyOn(EventModel, 'find').mockReturnValue(chain([makeDoc()]) as never);

    const repo = new MongooseEventRepository();
    const events = await repo.findUpcoming(5);

    const queryArgs = (EventModel.find as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(queryArgs).toMatchObject({ status: 'SCHEDULED' });
    expect(queryArgs.startDate).toHaveProperty('$gte');
    expect(events).toHaveLength(1);
  });

  it('exists e delete por id', async () => {
    jest.spyOn(EventModel, 'exists').mockResolvedValue(true as never);
    jest.spyOn(EventModel, 'findOneAndDelete').mockResolvedValue(makeDoc() as never);

    const repo = new MongooseEventRepository();
    await expect(repo.exists(FOOTBALL_EVENT)).resolves.toBe(true);
    await expect(repo.delete(FOOTBALL_EVENT)).resolves.toBe(true);
  });

  it('findByStatus e findByCategory retornam domínios', async () => {
    jest.spyOn(EventModel, 'find').mockReturnValue(chain([makeDoc()]) as never);

    const repo = new MongooseEventRepository();
    const byStatus = await repo.findByStatus('SCHEDULED');
    const byCategory = await repo.findByCategory('football');

    expect(byStatus[0].name).toBe('FC Tech vs Dev United');
    expect(byCategory[0].category).toBe('Football');
  });

  describe('falha do banco vira AppError INTERNAL_SERVER_ERROR (code/message/status corretos)', () => {
    const dbError = new Error('db down');

    beforeEach(() => {
      jest.spyOn(EventModel, 'estimatedDocumentCount').mockResolvedValue(5 as never);
    });

    it('findById', async () => {
      jest.spyOn(EventModel, 'findOne').mockReturnValue({
        lean: jest.fn().mockRejectedValue(dbError),
      } as never);
      const repo = new MongooseEventRepository();
      await expect(repo.findById(FOOTBALL_EVENT)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar evento',
        statusCode: 500,
      });
    });

    it('findByStatus', async () => {
      jest.spyOn(EventModel, 'find').mockReturnValue(rejectedChain(dbError) as never);
      const repo = new MongooseEventRepository();
      await expect(repo.findByStatus('SCHEDULED')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar eventos por status',
        statusCode: 500,
      });
    });

    it('findByCategory', async () => {
      jest.spyOn(EventModel, 'find').mockReturnValue(rejectedChain(dbError) as never);
      const repo = new MongooseEventRepository();
      await expect(repo.findByCategory('football')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar eventos por categoria',
        statusCode: 500,
      });
    });

    it('findUpcoming', async () => {
      jest.spyOn(EventModel, 'find').mockReturnValue(rejectedChain(dbError) as never);
      const repo = new MongooseEventRepository();
      await expect(repo.findUpcoming(5)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar próximos eventos',
        statusCode: 500,
      });
    });

    it('findAll', async () => {
      jest.spyOn(EventModel, 'find').mockReturnValue(rejectedChain(dbError) as never);
      const repo = new MongooseEventRepository();
      await expect(repo.findAll()).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao listar eventos',
        statusCode: 500,
      });
    });

    it('exists', async () => {
      jest.spyOn(EventModel, 'exists').mockRejectedValue(dbError);
      const repo = new MongooseEventRepository();
      await expect(repo.exists(FOOTBALL_EVENT)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao verificar evento',
        statusCode: 500,
      });
    });

    it('delete', async () => {
      jest.spyOn(EventModel, 'findOneAndDelete').mockRejectedValue(dbError);
      const repo = new MongooseEventRepository();
      await expect(repo.delete(FOOTBALL_EVENT)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao deletar evento',
        statusCode: 500,
      });
    });
  });
});