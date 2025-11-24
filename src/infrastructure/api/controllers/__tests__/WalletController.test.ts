import { WalletController } from '../WalletController';
import { AuthenticatedRequest } from '../../middleware/AuthMiddleware';
import { flushWalletCache } from '@/infrastructure/cache/cacheHooks';
import { Response } from 'express';

jest.mock('@/infrastructure/cache/cacheHooks', () => ({
  flushWalletCache: jest.fn().mockResolvedValue(undefined),
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

const createAuthRequest = (overrides?: Partial<AuthenticatedRequest>): AuthenticatedRequest =>
  ({
    headers: {},
    body: {},
    query: {},
    params: {},
    auth: { userId: 'user-1', sessionId: 'sess-1' },
    ...overrides,
  }) as AuthenticatedRequest;

describe('WalletController', () => {
  const getWalletUseCase = { execute: jest.fn() };
  const depositUseCase = { execute: jest.fn() };
  const withdrawUseCase = { execute: jest.fn() };
  const getHistoryUseCase = { execute: jest.fn() };
  const flushWalletCacheMock = flushWalletCache as jest.MockedFunction<typeof flushWalletCache>;

  const buildController = () =>
    new WalletController(
      getWalletUseCase as any,
      depositUseCase as any,
      withdrawUseCase as any,
      getHistoryUseCase as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    flushWalletCacheMock.mockResolvedValue(undefined);
  });

  describe('getMe', () => {
    it('returns 401 when auth is missing', async () => {
      const controller = buildController();
      const res = createResponse();

      await controller.getMe(createAuthRequest({ auth: undefined }), res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 404 when wallet not found', async () => {
      const controller = buildController();
      getWalletUseCase.execute.mockResolvedValueOnce(null);
      const res = createResponse();

      await controller.getMe(createAuthRequest(), res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns wallet data when found', async () => {
      const controller = buildController();
      getWalletUseCase.execute.mockResolvedValueOnce({
        userId: 'user-1',
        balance: 150,
        lockedBalance: 20,
        currency: 'BRL',
      });
      const res = createResponse();

      await controller.getMe(createAuthRequest(), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body?.data).toEqual({
        userId: 'user-1',
        balance: 150,
        lockedBalance: 20,
        currency: 'BRL',
      });
    });
  });

  describe('deposit', () => {
    it('returns 401 when missing auth', async () => {
      const controller = buildController();
      const res = createResponse();

      await controller.deposit(createAuthRequest({ auth: undefined }), res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when DTO validation fails', async () => {
      const controller = buildController();
      const validateSpy = jest.spyOn(controller as any, 'validateSchema').mockReturnValueOnce(null);
      const res = createResponse();

      await controller.deposit(createAuthRequest({ body: {} }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      validateSpy.mockRestore();
    });

    it('performs deposits, flushes cache, and returns 201', async () => {
      const controller = buildController();
      depositUseCase.execute.mockResolvedValueOnce({
        userId: 'user-1',
        balance: 200,
        lockedBalance: 0,
        currency: 'BRL',
      });
      const res = createResponse();

      await controller.deposit(
        createAuthRequest({
          body: {
            amount: 100,
            currency: 'BRL',
          },
        }),
        res,
      );

      expect(depositUseCase.execute).toHaveBeenCalledWith('user-1', 100);
      expect(flushWalletCacheMock).toHaveBeenCalledWith('user-1');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.body?.data?.wallet.balance).toBe(200);
    });

    it('logs a warning when cache flush fails but still returns success', async () => {
      const controller = buildController();
      depositUseCase.execute.mockResolvedValueOnce({
        userId: 'user-1',
        balance: 150,
        lockedBalance: 0,
        currency: 'BRL',
      });
      flushWalletCacheMock.mockRejectedValueOnce(new Error('fail'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const res = createResponse();

      await controller.deposit(
        createAuthRequest({
          body: {
            amount: 50,
            currency: 'BRL',
          },
        }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(warnSpy).toHaveBeenCalledWith('Failed to flush wallet cache', expect.any(Error));
      warnSpy.mockRestore();
    });
  });

  describe('withdraw', () => {
    it('returns 401 when missing auth', async () => {
      const controller = buildController();
      const res = createResponse();

      await controller.withdraw(createAuthRequest({ auth: undefined }), res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when payload is invalid', async () => {
      const controller = buildController();
      const validateSpy = jest.spyOn(controller as any, 'validateSchema').mockReturnValueOnce(null);
      const res = createResponse();

      await controller.withdraw(createAuthRequest({ body: {} }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      validateSpy.mockRestore();
    });

    it('calls use case and flushes cache on success', async () => {
      const controller = buildController();
      withdrawUseCase.execute.mockResolvedValueOnce({
        userId: 'user-1',
        balance: 80,
        lockedBalance: 10,
        currency: 'BRL',
      });
      const res = createResponse();

      await controller.withdraw(
        createAuthRequest({
          body: {
            amount: 20,
            currency: 'BRL',
          },
        }),
        res,
      );

      expect(withdrawUseCase.execute).toHaveBeenCalledWith('user-1', 20);
      expect(flushWalletCacheMock).toHaveBeenCalledWith('user-1');
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('getHistory', () => {
    it('requires auth', async () => {
      const controller = buildController();
      const res = createResponse();

      await controller.getHistory(createAuthRequest({ auth: undefined }), res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns paginated history for authenticated users', async () => {
      const controller = buildController();
      getHistoryUseCase.execute.mockResolvedValueOnce({
        transactions: [{ id: 'tx-1' }],
        total: 1,
      });
      const req = createAuthRequest({ query: { limit: '5', offset: '10' } as any });
      const res = createResponse();

      await controller.getHistory(req, res);

      expect(getHistoryUseCase.execute).toHaveBeenCalledWith('user-1', 5, 10);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body?.data).toEqual({
        transactions: [{ id: 'tx-1' }],
        pagination: { limit: 5, offset: 10, total: 1 },
      });
    });
  });
});
