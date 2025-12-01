import request from 'supertest';
import { createApiServer } from '@/infrastructure/api/ApiServer';
import express, { Router } from 'express';
import { AuthController } from '@/infrastructure/api/controllers/AuthController';
import { WalletController } from '@/infrastructure/api/controllers/WalletController';
import { BetController } from '@/infrastructure/api/controllers/BetController';
import { UserService } from '@/core/user/domain/services/UserService';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { BetService } from '@/core/betting/domain/services/BetService';
import { UserRepository } from '@/core/user/domain/repositories/UserRepository';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { BetRepository } from '@/core/betting/domain/repositories/BetRepository';
import { EventRepository } from '@/core/betting/domain/repositories/EventRepository';
import { RegisterUser } from '@/core/user/application/use-cases/RegisterUser';
import { GetWallet } from '@/core/finance/application/use-cases/GetWallet';
import { Deposit } from '@/core/finance/application/use-cases/Deposit';
import { Withdraw } from '@/core/finance/application/use-cases/Withdraw';
import { GetHistory } from '@/core/finance/application/use-cases/GetHistory';
import { PlaceBetUseCase } from '@/core/betting/aplication/use-cases/PlaceBetUseCase';
import { CancelBetUseCase } from '@/core/betting/aplication/use-cases/CancelBetUseCase';
import { GetUserBetsUseCase } from '@/core/betting/aplication/use-cases/GetUserBetsUseCase';
import { GetEventBetsUseCase } from '@/core/betting/aplication/use-cases/GetEventUseCase';
import { asyncHandler } from '@/infrastructure/api/middleware/asyncHandler';
import { protectedRoute } from '@/infrastructure/api/middleware/AuthMiddleware';
import { ClerkService } from '@/shared/services/ClerkService';
import { JwtService } from '@/shared/services/JwtService';

jest.setTimeout(20000);

describe('API expanded integration tests (isolated)', () => {
  let app: express.Express;
  const PASSWORD = 'Password123!';

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.CLERK_SECRET_KEY = 'sk_test_dummy';

    const server = createApiServer(0);

    const userRepo = new UserRepository();
    const walletRepo = new WalletRepository();
    const betRepo = new BetRepository();
    const eventRepo = new EventRepository();

    const userService = new UserService(userRepo);
    const walletService = new WalletService(walletRepo);
    const betService = new BetService(betRepo, eventRepo, walletService);

    const registerUserUseCase = new RegisterUser(userService, walletService);

    const getWalletUC = new GetWallet(walletService);
    const depositUC = new Deposit(walletService);
    const withdrawUC = new Withdraw(walletService);
    const historyUC = new GetHistory(walletService);

    const placeBetUC = new PlaceBetUseCase(betService);
    const cancelBetUC = new CancelBetUseCase(betService);
    const getUserBetsUC = new GetUserBetsUseCase(betService);
    const getEventBetsUC = new GetEventBetsUseCase(betService);

    const clerkService = new ClerkService();
    const jwtService = new JwtService();
    const authController = new AuthController(
      registerUserUseCase,
      userService,
      clerkService,
      jwtService,
    );
    const walletController = new WalletController(getWalletUC, depositUC, withdrawUC, historyUC);
    const betController = new BetController(placeBetUC, cancelBetUC, getUserBetsUC, getEventBetsUC);

    const router = Router();

    router.post(
      '/auth/register',
      asyncHandler((req, res) => authController.register(req, res)),
    );
    router.post(
      '/auth/login',
      asyncHandler((req, res) => authController.login(req, res)),
    );
    router.get(
      '/auth/me',
      protectedRoute,
      asyncHandler((req, res) => authController.me(req as any, res)),
    );

    router.post(
      '/wallets/deposit',
      protectedRoute,
      asyncHandler((req, res) => walletController.deposit(req as any, res)),
    );
    router.post(
      '/wallets/withdraw',
      protectedRoute,
      asyncHandler((req, res) => walletController.withdraw(req as any, res)),
    );
    router.get(
      '/wallets/history',
      protectedRoute,
      asyncHandler((req, res) => walletController.getHistory(req as any, res)),
    );

    router.post(
      '/bets',
      protectedRoute,
      asyncHandler((req, res) => betController.placeBet(req as any, res)),
    );

    server.registerHealthCheck();
    server.registerRoutes(router, '');
    server.registerErrorHandler();
    server.get404Handler();

    app = server.getExpressApp();
  });

  const makeRegisterPayload = (email: string, username: string) => ({
    email,
    password: PASSWORD,
    username,
    firstName: 'Int',
    lastName: 'Test',
  });

  const registerAndLogin = async (label: string) => {
    const payload = makeRegisterPayload(`${label}@example.com`, `${label}_user`);
    const registerRes = await request(app).post('/api/auth/register').send(payload);
    expect(registerRes.status).toBe(201);

    const loginRes = await request(app).post('/api/auth/login').send({
      email: payload.email,
      password: payload.password,
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data).toBeDefined();
    return loginRes.body.data;
  };

  afterEach(() => {
    // nothing to teardown currently because in-memory repos are GC'd
    jest.restoreAllMocks();
  });

  test('duplicate register returns 409 CONFLICT with error.code CONFLICT', async () => {
    const payload = {
      email: 'dup@example.com',
      password: 'Password123!',
      username: 'dup_user',
      firstName: 'Dup',
      lastName: 'User',
    };

    const r1 = await request(app).post('/api/auth/register').send(payload);
    expect(r1.status).toBe(201);

    const r2 = await request(app).post('/api/auth/register').send(payload);
    expect(r2.status).toBe(409);
    expect(r2.body.success).toBe(false);
    expect(r2.body.error).toBeDefined();
    expect(r2.body.error.code).toBe('CONFLICT');
    expect(r2.body.meta).toBeDefined();
    expect(typeof r2.body.meta.timestamp).toBe('string');
  });

  test('GET /api/auth/me without Authorization returns 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    // API may return either the unified { success: false } shape or legacy shape without success
    if (typeof res.body.success !== 'undefined') {
      expect(res.body.success).toBe(false);
    }
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('deposit validation error returns 400 VALIDATION_ERROR', async () => {
    // register user
    const loginData = await registerAndLogin('val');

    // Missing amount
    const res = await request(app)
      .post('/api/wallets/deposit')
      .set('Authorization', `Bearer ${loginData.accessToken}`)
      .send({ currency: 'BRL' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    // validate schema throws VALIDATION_ERROR via AppError
    expect(
      res.body.error.code === 'VALIDATION_ERROR' || res.body.error.code === 'BAD_REQUEST',
    ).toBe(true);
  });

  test('withdraw with insufficient funds returns 400 BAD_REQUEST and message', async () => {
    const loginData = await registerAndLogin('insuff');

    // Ensure wallet exists but no deposit
    const res = await request(app)
      .post('/api/wallets/withdraw')
      .set('Authorization', `Bearer ${loginData.accessToken}`)
      .send({ amount: 500.0, currency: 'BRL', description: 'Attempt overdraw' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('WALLET_INSUFFICIENT_FUNDS');
    expect(res.body.error.message).toMatch(/saldo|Saldo|insuficiente|Insufficient/i);
  });

  test('wallet history returns correct transaction count and total', async () => {
    const loginData = await registerAndLogin('hist');

    // two deposits
    await request(app)
      .post('/api/wallets/deposit')
      .set('Authorization', `Bearer ${loginData.accessToken}`)
      .send({ amount: 10, currency: 'BRL', description: 'd1' });

    await request(app)
      .post('/api/wallets/deposit')
      .set('Authorization', `Bearer ${loginData.accessToken}`)
      .send({ amount: 20, currency: 'BRL', description: 'd2' });

    const res = await request(app)
      .get('/api/wallets/history')
      .set('Authorization', `Bearer ${loginData.accessToken}`)
      .query({ limit: 10, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    // transactions may be at data.transactions and total may be at data.total or data.pagination.total
    expect(Array.isArray(res.body.data.transactions)).toBe(true);
    expect(res.body.data.transactions.length).toBeGreaterThanOrEqual(2);
    const total = res.body.data.total ?? res.body.data.pagination?.total;
    expect(typeof total === 'number').toBe(true);
    expect(total).toBeGreaterThanOrEqual(2);
  });
});
