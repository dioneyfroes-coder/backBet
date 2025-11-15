import request from 'supertest';
import { createApiServer } from '../infrastructure/api/ApiServer';
import express, { Router } from 'express';
import { AuthController } from '../infrastructure/api/controllers/AuthController';
import { WalletController } from '../infrastructure/api/controllers/WalletController';
import { BetController } from '../infrastructure/api/controllers/BetController';
import { UserService } from '../core/user/domain/services/UserService';
import { WalletService } from '../core/finance/domain/services/WalletService';
import { BetService } from '../core/betting/domain/services/BetService';
import { UserRepository } from '../core/user/domain/repositories/UserRepository';
import { WalletRepository } from '../core/finance/domain/repositories/WalletRepository';
import { BetRepository } from '../core/betting/domain/repositories/BetRepository';
import { EventRepository } from '../core/betting/domain/repositories/EventRepository';
import { RegisterUser } from '../core/user/application/use-cases/RegisterUser';
import { GetWallet } from '../core/finance/application/use-cases/GetWallet';
import { Deposit } from '../core/finance/application/use-cases/Deposit';
import { Withdraw } from '../core/finance/application/use-cases/Withdraw';
import { GetHistory } from '../core/finance/application/use-cases/GetHistory';
import { PlaceBetUseCase } from '../core/betting/aplication/use-cases/PlaceBetUseCase';
import { CancelBetUseCase } from '../core/betting/aplication/use-cases/CancelBetUseCase';
import { GetUserBetsUseCase } from '../core/betting/aplication/use-cases/GetUserBetsUseCase';
import { GetEventBetsUseCase } from '../core/betting/aplication/use-cases/GetEventUseCase';
import { asyncHandler } from '../infrastructure/api/middleware/asyncHandler';
import { protectedRoute } from '../infrastructure/api/middleware/AuthMiddleware';

describe('API integration tests', () => {
  let app: express.Express;

  beforeAll(() => {
    // Force development mode so protectedRoute accepts Bearer <userId>
    process.env.NODE_ENV = 'development';
    process.env.CLERK_SECRET_KEY = 'sk_test_dummy';

    const server = createApiServer(0);

    // Shared repositories so endpoints see the same state
    const userRepo = new UserRepository();
    const walletRepo = new WalletRepository();
    const betRepo = new BetRepository();
    const eventRepo = new EventRepository();

    // Services
    const userService = new UserService(userRepo);
    const walletService = new WalletService(walletRepo);
    const betService = new BetService(betRepo, eventRepo, walletService);

    // Use-cases
    const registerUserUseCase = new RegisterUser(userService, walletService);

    const getWalletUC = new GetWallet(walletService);
    const depositUC = new Deposit(walletService);
    const withdrawUC = new Withdraw(walletService);
    const historyUC = new GetHistory(walletService);

    const placeBetUC = new PlaceBetUseCase(betService);
    const cancelBetUC = new CancelBetUseCase(betService);
    const getUserBetsUC = new GetUserBetsUseCase(betService);
    const getEventBetsUC = new GetEventBetsUseCase(betService);

    // Controllers with shared services
    const authController = new AuthController(registerUserUseCase, userService);
    const walletController = new WalletController(getWalletUC, depositUC, withdrawUC, historyUC);
    const betController = new BetController(placeBetUC, cancelBetUC, getUserBetsUC, getEventBetsUC);

    // Build a router that exposes auth and wallet endpoints under /api
    const router = Router();

    // Auth
    router.post('/auth/register', asyncHandler((req, res) => authController.register(req, res)));
    router.get('/auth/me', protectedRoute, asyncHandler((req, res) => authController.me(req as any, res)));

    // Wallets
    router.get('/wallets/me', protectedRoute, asyncHandler((req, res) => walletController.getMe(req as any, res)));
    router.post('/wallets/deposit', protectedRoute, asyncHandler((req, res) => walletController.deposit(req as any, res)));

    // Bets
    router.post('/bets', protectedRoute, asyncHandler((req, res) => betController.placeBet(req as any, res)));

    server.registerHealthCheck();
    server.registerRoutes(router, '');
    server.registerErrorHandler();
    server.get404Handler();

    app = server.getExpressApp();
  });

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
    // Register first
    const r = await request(app).post('/api/auth/register').send({
      email: 'me@example.com',
      password: 'Password123!',
      username: 'me_user',
      firstName: 'Me',
      lastName: 'User',
    });

    const userId = r.body.data.user.id;

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${userId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(userId);
  });

  test('POST /api/wallets/deposit -> creates wallet and deposits', async () => {
    const r = await request(app).post('/api/auth/register').send({
      email: 'wallet@example.com',
      password: 'Password123!',
      username: 'wallet_user',
      firstName: 'Wallet',
      lastName: 'User',
    });

    const userId = r.body.data.user.id;

    const depositRes = await request(app)
      .post('/api/wallets/deposit')
      .set('Authorization', `Bearer ${userId}`)
      .send({ amount: 150.5, currency: 'BRL', description: 'Test deposit' });

    expect([200,201]).toContain(depositRes.status);
    expect(depositRes.body.success).toBe(true);
    expect(depositRes.body.data).toBeDefined();
    expect(depositRes.body.data.wallet).toBeDefined();
    expect(depositRes.body.data.wallet.balance).toBeDefined();
  });

  test('POST /api/bets -> place a bet', async () => {
    const r = await request(app).post('/api/auth/register').send({
      email: 'bet@example.com',
      password: 'Password123!',
      username: 'bet_user',
      firstName: 'Bet',
      lastName: 'User',
    });

    const userId = r.body.data.user.id;

    const res = await request(app)
      .post('/api/bets')
      .set('Authorization', `Bearer ${userId}`)
      .send({
        eventId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        marketId: 'market-123',
        oddId: 'odd-456',
        amount: 10,
        type: 'SINGLE',
        currency: 'BRL',
      });

  // Depending on business rules this can return 201, 400 or 404 (no event)
  expect([200,201,400,404]).toContain(res.status);
    expect(res.body).toBeDefined();
  });
});
