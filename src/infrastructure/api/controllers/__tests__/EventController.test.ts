import { Request, Response } from 'express';
import { EventController } from '../EventController';

type MockResponse = Response & {
  statusCode?: number;
  body?: any;
  status: jest.MockedFunction<(code: number) => Response>;
  json: jest.MockedFunction<(payload: any) => Response>;
};

const createResponse = (): MockResponse => {
  const res: Partial<MockResponse> = {};
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res as MockResponse;
  });
  res.json = jest.fn().mockImplementation((payload: any) => {
    res.body = payload;
    return res as MockResponse;
  });
  return res as MockResponse;
};

const createRequest = (overrides?: Partial<Request>): Request =>
  ({
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  }) as Request;

const EVENT_JSON = { id: 'evt-1', sport: 'football', status: 'SCHEDULED' };

const buildEvent = (id: string) => ({
  id,
  toJSON: () => ({ ...EVENT_JSON, id }),
  markets: new Map([
    ['mkt-1', { toJSON: () => ({ id: 'mkt-1', name: 'Resultado', odds: [] }) }],
  ]),
});

describe('EventController', () => {
  const listEventsUseCase = { execute: jest.fn() };
  const getEventDetailsUseCase = { execute: jest.fn() };
  const getUpcomingEventsUseCase = { execute: jest.fn() };
  const listEventCategoriesUseCase = { execute: jest.fn() };
  const controller = new EventController(
    listEventsUseCase as unknown as any,
    getEventDetailsUseCase as unknown as any,
    getUpcomingEventsUseCase as unknown as any,
    listEventCategoriesUseCase as unknown as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists events with default pagination metadata', async () => {
    listEventsUseCase.execute.mockResolvedValue([
      buildEvent('evt-1'),
      buildEvent('evt-2'),
      buildEvent('evt-3'),
    ]);
    const res = createResponse();

    await controller.listEvents(createRequest(), res);

    expect(listEventsUseCase.execute).toHaveBeenCalledWith({
      status: undefined,
      category: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      search: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body?.data?.events).toHaveLength(3);
    expect(res.body?.data?.pagination).toEqual({ limit: 50, offset: 0, total: 3 });
  });

  it('paginates and honors limit/offset for events', async () => {
    listEventsUseCase.execute.mockResolvedValue([
      buildEvent('evt-1'),
      buildEvent('evt-2'),
      buildEvent('evt-3'),
    ]);
    const res = createResponse();
    const req = createRequest({ query: { limit: '1', offset: '1' } } as any);

    await controller.listEvents(req, res);

    expect(res.body?.data?.events).toEqual([{ ...EVENT_JSON, id: 'evt-2' }]);
    expect(res.body?.data?.pagination).toEqual({ limit: 1, offset: 1, total: 3 });
  });

  it('passes filters through and caps limit at the maximum', async () => {
    listEventsUseCase.execute.mockResolvedValue([buildEvent('evt-1')]);
    const res = createResponse();
    const req = createRequest({
      query: { status: 'LIVE', search: 'fla', limit: '9999' } as any,
    });

    await controller.listEvents(req, res);

    expect(listEventsUseCase.execute).toHaveBeenCalledWith({
      status: 'LIVE',
      category: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      search: 'fla',
    });
    expect(res.body?.data?.pagination).toEqual({ limit: 200, offset: 0, total: 1 });
  });

  it('returns event details', async () => {
    getEventDetailsUseCase.execute.mockResolvedValue(buildEvent('evt-1'));
    const res = createResponse();

    await controller.getEventDetails(createRequest({ params: { eventId: 'evt-1' } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body?.data?.id).toBe('evt-1');
  });

  it('returns markets of an event', async () => {
    getEventDetailsUseCase.execute.mockResolvedValue(buildEvent('evt-1'));
    const res = createResponse();

    await controller.getEventMarkets(createRequest({ params: { eventId: 'evt-1' } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body?.data?.markets).toEqual([{ id: 'mkt-1', name: 'Resultado', odds: [] }]);
  });

  it('lists upcoming events with the requested limit', async () => {
    getUpcomingEventsUseCase.execute.mockResolvedValue([buildEvent('evt-1')]);
    const res = createResponse();
    const req = createRequest({ query: { limit: '5' } } as any);

    await controller.listUpcoming(req, res);

    expect(getUpcomingEventsUseCase.execute).toHaveBeenCalledWith(5);
    expect(res.body?.data?.events).toHaveLength(1);
  });

  it('lists categories', async () => {
    listEventCategoriesUseCase.execute.mockResolvedValue(['football', 'basketball']);
    const res = createResponse();

    await controller.listCategories(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body?.data?.categories).toEqual(['football', 'basketball']);
  });
});