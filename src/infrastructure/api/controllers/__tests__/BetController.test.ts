import { Request, Response } from 'express';
import { BetController } from '../BetController';
import { AuthenticatedRequest } from '../../middleware/AuthMiddleware';
import { flushEventOddsCache } from '@/infrastructure/cache/cacheHooks';

jest.mock('@/infrastructure/cache/cacheHooks', () => ({
  flushEventOddsCache: jest.fn().mockResolvedValue(undefined),
}));

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

const createAuthRequest = (overrides?: Partial<AuthenticatedRequest>): AuthenticatedRequest =>
  ({
    body: {},
    params: {},
    query: {},
    headers: {},
    auth: { userId: 'user-1', ...(overrides?.auth ?? {}) },
    ...overrides,
  }) as AuthenticatedRequest;

describe('BetController', () => {
  const placeBetUseCase = { execute: jest.fn() };
  const cancelBetUseCase = { execute: jest.fn() };
  const getUserBetsUseCase = { execute: jest.fn() };
  const getEventBetsUseCase = { execute: jest.fn() };
  const controller = new BetController(
    placeBetUseCase as unknown as any,
    cancelBetUseCase as unknown as any,
    getUserBetsUseCase as unknown as any,
    getEventBetsUseCase as unknown as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates eventId before listing bets', async () => {
    const res = createResponse();
    await controller.getEventBets(createRequest(), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns event bets as JSON', async () => {
    const bets = [{ toJSON: () => ({ id: 'bet-1' }) }];
    getEventBetsUseCase.execute.mockResolvedValue(bets);
    const res = createResponse();
    const req = createRequest({ params: { eventId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' } });

    await controller.getEventBets(req, res);

    expect(getEventBetsUseCase.execute).toHaveBeenCalledWith(
      '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    );
    expect(res.body?.data).toEqual({ bets: [{ id: 'bet-1' }] });
  });

  it('requires auth before placing bets', async () => {
    const res = createResponse();
    await controller.placeBet(createAuthRequest({ auth: undefined }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('places bets, flushes cache, and returns created bet', async () => {
    const bet = {
      toJSON: () => ({ id: 'bet-1' }),
      eventId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    };
    placeBetUseCase.execute.mockResolvedValue(bet);
    (flushEventOddsCache as jest.Mock).mockRejectedValueOnce(new Error('cache fail'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const req = createAuthRequest({
      body: {
        eventId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        marketId: 'mkt-1',
        oddId: 'odd-1',
        amount: 10,
        type: 'SINGLE',
      },
    });
    const res = createResponse();

    await controller.placeBet(req, res);

    expect(placeBetUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      eventId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      marketId: 'mkt-1',
      oddId: 'odd-1',
      amount: 10,
      type: 'SINGLE',
    });
    expect(flushEventOddsCache).toHaveBeenCalledWith('3fa85f64-5717-4562-b3fc-2c963f66afa6');
    expect(res.status).toHaveBeenCalledWith(201);
    warnSpy.mockRestore();
  });

  it('requires auth before canceling bets', async () => {
    const res = createResponse();
    await controller.cancelBet(createAuthRequest({ auth: undefined }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('cancels bets and flushes cache', async () => {
    const bet = {
      toJSON: () => ({ id: 'bet-1' }),
      eventId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    };
    cancelBetUseCase.execute.mockResolvedValue(bet);
    const req = createAuthRequest({
      params: { betId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
      body: { reason: 'user requested' },
    });
    const res = createResponse();

    await controller.cancelBet(req, res);

    expect(cancelBetUseCase.execute).toHaveBeenCalledWith({
      betId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      reason: 'user requested',
      canceledBy: 'user-1',
    });
    expect(flushEventOddsCache).toHaveBeenCalledWith('3fa85f64-5717-4562-b3fc-2c963f66afa6');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('requires auth before listing personal bets', async () => {
    const res = createResponse();
    await controller.getMyBets(createAuthRequest({ auth: undefined }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('lists bets for authenticated user', async () => {
    const bets = [{ toJSON: () => ({ id: 'bet-1' }) }, { toJSON: () => ({ id: 'bet-2' }) }];
    getUserBetsUseCase.execute.mockResolvedValue(bets);
    const res = createResponse();

    await controller.getMyBets(createAuthRequest(), res);

    expect(getUserBetsUseCase.execute).toHaveBeenCalledWith('user-1');
    expect(res.body?.data).toEqual({ bets: [{ id: 'bet-1' }, { id: 'bet-2' }] });
  });
});
