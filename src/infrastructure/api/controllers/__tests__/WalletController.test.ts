import { WalletController } from '../WalletController';
import { AuthenticatedRequest } from '../../middleware/AuthMiddleware';
import { flushWalletCache } from '@/infrastructure/cache/cacheHooks';
import { AppError } from '@/shared/errors/AppError';
import { Response } from 'express';
import { appConfig } from '../../../../shared/config/appConfig';

jest.mock('@/infrastructure/cache/cacheHooks', () => ({
  flushWalletCache: jest.fn().mockResolvedValue(undefined),
}));

type MockResponse = Response & {
  statusCode?: number;
  body?: any;
  status: jest.MockedFunction<(code: number) => Response>;
  json: jest.MockedFunction<(payload: any) => Response>;
  set: jest.MockedFunction<(name: string, value: string) => Response>;
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
  res.set = jest.fn().mockReturnValue(res as MockResponse);
  return res as MockResponse;
};

const createAuthRequest = (overrides?: Partial<AuthenticatedRequest>): AuthenticatedRequest =>
  ({
    headers: {},
    body: {},
    query: {},
    params: {},
    authContext: {
      userId: 'user-1',
      sessionId: 'sess-1',
      ...(overrides?.authContext ?? {}),
    },
    ...overrides,
  }) as AuthenticatedRequest;

describe('WalletController', () => {
  const getWalletUseCase = { execute: jest.fn() };
  const depositUseCase = { execute: jest.fn() };
  const withdrawUseCase = { execute: jest.fn() };
  const getHistoryUseCase = { execute: jest.fn() };
  const userService = { findById: jest.fn() };
  const flushWalletCacheMock = flushWalletCache as jest.MockedFunction<typeof flushWalletCache>;

  const buildController = () =>
    new WalletController(
      getWalletUseCase as any,
      depositUseCase as any,
      withdrawUseCase as any,
      getHistoryUseCase as any,
      userService as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    flushWalletCacheMock.mockResolvedValue(undefined);
    userService.findById.mockReset();
  });

  describe('getMe', () => {
    it('returns 401 when auth is missing', async () => {
      const controller = buildController();
      const res = createResponse();

      await controller.getMe(createAuthRequest({ authContext: undefined }), res);

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

      await controller.deposit(createAuthRequest({ authContext: undefined }), res);

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

    it('returns 503 when Pix deposits are disabled', async () => {
      const controller = buildController();
      const res = createResponse();
      const original = appConfig.payments.pix.features.depositsEnabled;
      appConfig.payments.pix.features.depositsEnabled = false;

      await controller.deposit(
        createAuthRequest({
          body: { amount: 10, currency: 'BRL' },
        }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(503);
      appConfig.payments.pix.features.depositsEnabled = original;
    });

    it('rejects deposits below the minimum amount', async () => {
      const controller = buildController();
      const res = createResponse();

      await expect(
        controller.deposit(
          createAuthRequest({
            body: {
              amount: 0.5,
              currency: 'BRL',
            },
          }),
          res,
        ),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('performs deposits, flushes cache, and returns Pix payload', async () => {
      const controller = buildController();
      const pixCharge = {
        chargeId: 'charge-1',
        reference: 'ref-1',
        status: 'PENDING',
        provider: 'mock',
        qrCode: 'qr-code',
        expiresAt: new Date('2025-01-01T00:05:00.000Z'),
      } as const;
      const pixConfirmation = {
        chargeId: 'charge-1',
        reference: 'ref-1',
        status: 'PAID',
        provider: 'mock',
        confirmedAt: new Date('2025-01-01T00:01:00.000Z'),
      } as const;
      depositUseCase.execute.mockResolvedValueOnce({
        wallet: {
          userId: 'user-1',
          balance: 200,
          lockedBalance: 0,
          currency: 'BRL',
        },
        pixCharge,
        pixConfirmation,
      });
      const res = createResponse();

      await controller.deposit(
        createAuthRequest({
          body: {
            amount: 100,
            currency: 'BRL',
            description: 'Test deposit',
          },
        }),
        res,
      );

      expect(depositUseCase.execute).toHaveBeenCalledWith('user-1', 100, 'BRL', 'Test deposit', undefined);
      expect(flushWalletCacheMock).toHaveBeenCalledWith('user-1');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.body?.data?.wallet.balance).toBe(200);
      expect(res.body?.data?.pix).toEqual({
        chargeId: pixCharge.chargeId,
        reference: pixCharge.reference,
        status: pixConfirmation.status,
        provider: pixConfirmation.provider,
        qrCode: pixCharge.qrCode,
        expiresAt: pixCharge.expiresAt,
        confirmedAt: pixConfirmation.confirmedAt,
      });
    });

    it('advertises Idempotency-Replayed header when a deposit key is replayed', async () => {
      const controller = buildController();
      depositUseCase.execute.mockResolvedValueOnce({
        wallet: {
          userId: 'user-1',
          balance: 200,
          lockedBalance: 0,
          currency: 'BRL',
        },
        pixCharge: {
          chargeId: 'charge-1',
          reference: 'ref-1',
          status: 'PAID',
          provider: 'mock',
          qrCode: 'qr-code',
          expiresAt: new Date(),
        },
        pixConfirmation: {
          chargeId: 'charge-1',
          reference: 'ref-1',
          status: 'PAID',
          provider: 'mock',
          confirmedAt: new Date(),
        },
        replayed: true,
      });
      const res = createResponse();

      await controller.deposit(
        createAuthRequest({
          headers: { 'idempotency-key': 'dep-req-1' } as any,
          body: { amount: 100, currency: 'BRL' },
        }),
        res,
      );

      expect(depositUseCase.execute).toHaveBeenCalledWith(
        'user-1',
        100,
        'BRL',
        undefined,
        'dep-req-1',
      );
      expect(res.set).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('logs a warning when cache flush fails but still returns success', async () => {
      const controller = buildController();
      depositUseCase.execute.mockResolvedValueOnce({
        wallet: {
          userId: 'user-1',
          balance: 150,
          lockedBalance: 0,
          currency: 'BRL',
        },
        pixCharge: {
          chargeId: 'charge-1',
          reference: 'ref-1',
          status: 'PENDING',
          provider: 'mock',
          qrCode: 'qr',
          expiresAt: new Date(),
        },
        pixConfirmation: {
          chargeId: 'charge-1',
          reference: 'ref-1',
          status: 'PAID',
          provider: 'mock',
          confirmedAt: new Date(),
        },
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

      await controller.withdraw(createAuthRequest({ authContext: undefined }), res);

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

    it('returns 503 when Pix withdrawals are disabled', async () => {
      const controller = buildController();
      const res = createResponse();
      const original = appConfig.payments.pix.features.withdrawalsEnabled;
      appConfig.payments.pix.features.withdrawalsEnabled = false;

      await controller.withdraw(
        createAuthRequest({
          body: {
            amount: 150,
            currency: 'BRL',
            pixKey: 'user@pix',
          },
        }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(503);
      appConfig.payments.pix.features.withdrawalsEnabled = original;
    });

    it('rejects withdrawals below the minimum amount', async () => {
      const controller = buildController();
      const res = createResponse();

      await expect(
        controller.withdraw(
          createAuthRequest({
            body: {
              amount: 50,
              currency: 'BRL',
              pixKey: 'user@pix',
            },
          }),
          res,
        ),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('returns 400 when pixKey is missing and user has no stored key', async () => {
      const controller = buildController();
      userService.findById.mockResolvedValueOnce(null);
      const res = createResponse();

      await controller.withdraw(
        createAuthRequest({
          body: {
            amount: 150,
            currency: 'BRL',
          },
        }),
        res,
      );

      expect(userService.findById).toHaveBeenCalledWith('user-1');
      expect(withdrawUseCase.execute).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('uses stored pix key when payload omits it', async () => {
      const controller = buildController();
      userService.findById.mockResolvedValueOnce({ pixKey: 'stored@pix' });
      const pixPayout = {
        payoutId: 'payout-2',
        reference: 'ref-3',
        status: 'PROCESSING',
        provider: 'mock',
        processedAt: new Date('2025-01-02T00:02:00.000Z'),
      };
      withdrawUseCase.execute.mockResolvedValueOnce({
        wallet: {
          userId: 'user-1',
          balance: 70,
          lockedBalance: 5,
          currency: 'BRL',
        },
        pixPayout,
      });
      const res = createResponse();

      await controller.withdraw(
        createAuthRequest({
          body: {
            amount: 200,
            currency: 'BRL',
          },
        }),
        res,
      );

      expect(userService.findById).toHaveBeenCalledWith('user-1');
      expect(withdrawUseCase.execute).toHaveBeenCalledWith(
        'user-1',
        200,
        'BRL',
        'stored@pix',
        undefined,
        undefined,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.body?.data?.wallet.balance).toBe(70);
    });

    it('calls use case and flushes cache on success', async () => {
      const controller = buildController();
      const pixPayout = {
        payoutId: 'payout-1',
        reference: 'ref-2',
        status: 'COMPLETED',
        provider: 'mock',
        processedAt: new Date('2025-01-01T00:02:00.000Z'),
      };
      withdrawUseCase.execute.mockResolvedValueOnce({
        wallet: {
          userId: 'user-1',
          balance: 80,
          lockedBalance: 10,
          currency: 'BRL',
        },
        pixPayout,
      });
      const res = createResponse();

      await controller.withdraw(
        createAuthRequest({
          body: {
            amount: 150,
            currency: 'BRL',
            pixKey: 'user@pix',
            description: 'Manual cashout',
          },
        }),
        res,
      );

      expect(withdrawUseCase.execute).toHaveBeenCalledWith(
        'user-1',
        150,
        'BRL',
        'user@pix',
        'Manual cashout',
        undefined,
      );
      expect(userService.findById).not.toHaveBeenCalled();
      expect(flushWalletCacheMock).toHaveBeenCalledWith('user-1');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.body?.data?.pix).toEqual({
        payoutId: pixPayout.payoutId,
        reference: pixPayout.reference,
        status: pixPayout.status,
        provider: pixPayout.provider,
        processedAt: pixPayout.processedAt,
      });
    });
  });

  describe('getHistory', () => {
    it('requires auth', async () => {
      const controller = buildController();
      const res = createResponse();

      await controller.getHistory(createAuthRequest({ authContext: undefined }), res);

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
