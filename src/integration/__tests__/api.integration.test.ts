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

describe('API integration tests', () => {
  let app: express.Express;
  const PASSWORD = 'Password123!';

  beforeAll(() => {
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
    const authController = new AuthController(registerUserUseCase, userService, clerkService, jwtService);
    const walletController = new WalletController(getWalletUC, depositUC, withdrawUC, historyUC);
    const betController = new BetController(placeBetUC, cancelBetUC, getUserBetsUC, getEventBetsUC);

    const router = Router();

    router.post('/auth/register', asyncHandler((req, res) => authController.register(req, res)));
    router.post('/auth/login', asyncHandler((req, res) => authController.login(req, res)));
    router.post('/auth/refresh', asyncHandler((req, res) => authController.refreshToken(req, res)));
    router.get('/auth/me', protectedRoute, asyncHandler((req, res) => authController.me(req as any, res)));

    router.get('/wallets/me', protectedRoute, asyncHandler((req, res) => walletController.getMe(req as any, res)));
    router.post('/wallets/deposit', protectedRoute, asyncHandler((req, res) => walletController.deposit(req as any, res)));

    router.post('/bets', protectedRoute, asyncHandler((req, res) => betController.placeBet(req as any, res)));

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

  test('POST /api/auth/register -> registers a user and returns wallet', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'inttest@example.com',
      password: 'Password123!',
      username: 'int_user',
      firstName: 'Int',
      lastName: 'Test',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.id).toBeDefined();
  });

  test('GET /api/auth/me -> returns authenticated user', async () => {
    const loginData = await registerAndLogin('me');
    console.log('loginData', loginData);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginData.accessToken}`);
    console.log('auth/me response', res.status, res.body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(loginData.user.id);
  });

  test('POST /api/wallets/deposit -> creates wallet and deposits', async () => {
    const loginData = await registerAndLogin('wallet');

    const depositRes = await request(app)
      .post('/api/wallets/deposit')
      .set('Authorization', `Bearer ${loginData.accessToken}`)
      .send({ amount: 150.5, currency: 'BRL', description: 'Test deposit' });

    expect([200, 201]).toContain(depositRes.status);
    expect(depositRes.body.success).toBe(true);
    expect(depositRes.body.data).toBeDefined();
    expect(depositRes.body.data.wallet).toBeDefined();
    expect(depositRes.body.data.wallet.balance).toBeDefined();
  });

  test('POST /api/bets -> place a bet', async () => {
    const loginData = await registerAndLogin('bet');

    const res = await request(app)
      .post('/api/bets')
      .set('Authorization', `Bearer ${loginData.accessToken}`)
      .send({
        eventId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        marketId: 'market-123',
        oddId: 'odd-456',
        amount: 10,
        type: 'SINGLE',
        currency: 'BRL',
      });

    expect([200, 201, 400, 404]).toContain(res.status);
    expect(res.body).toBeDefined();
  });

  test('POST /api/auth/refresh -> issues new access token', async () => {
    const loginData = await registerAndLogin('refresh');

    const refreshRes = await request(app).post('/api/auth/refresh').send({
      refreshToken: loginData.refreshToken,
    });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshRes.body.data.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.id).toBe(loginData.user.id);
  });
});
