process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

import request from 'supertest';
import express, { Router } from 'express';
import { createApiServer } from '@/infrastructure/api/ApiServer';
import { createAuthRoutes } from '@/infrastructure/api/routes/authRoutes';
import { createWalletRoutes } from '@/infrastructure/api/routes/walletRoutes';
import { createBetRoutes } from '@/infrastructure/api/routes/betRoutes';
import { createAdminRoutes } from '@/infrastructure/api/routes/adminRoutes';
import { UserRepository } from '@/core/user/domain/repositories/UserRepository';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { BetRepository } from '@/core/betting/domain/repositories/BetRepository';
import { EventRepository } from '@/core/betting/domain/repositories/EventRepository';
import { InMemoryLedgerRepository } from '@/core/finance/domain/repositories/InMemoryLedgerRepository';
import { InMemoryRiskRepository } from '@/infrastructure/persistence/inmemory/repositories/InMemoryRiskRepository';
import { HouseTreasuryRepository } from '@/core/treasury/domain/repositories/HouseTreasuryRepository';
import { ResponsibleGamblingRepository } from '@/core/responsibleGambling/domain/repositories/ResponsibleGamblingRepository';
import { JwtService } from '@/shared/services/JwtService';
import { MockPixProvider } from '@/infrastructure/payments/pix/MockPixProvider';
import { appConfig } from '@/shared/config/appConfig';

jest.setTimeout(30000);

const PASSWORD = 'Password123!';
const FOOTBALL_EVENT = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const MARKET_ID = 'mkt-1x2';
const ODD_ID = 'home';

let app: express.Express;
let userRepo: UserRepository;
let walletRepo: WalletRepository;
let ledgrRepo: InMemoryLedgerRepository;
let betRepo: BetRepository;
let eventRepo: EventRepository;

async function buildTestApp(): Promise<void> {
  appConfig.admin.allowedUserIds = [];

  userRepo = new UserRepository();
  walletRepo = new WalletRepository();
  ledgrRepo = new InMemoryLedgerRepository();
  betRepo = new BetRepository();
  eventRepo = new EventRepository();
  const riskRepo = new InMemoryRiskRepository();
  const jwtService = new JwtService();
  const pixProvider = new MockPixProvider({ latencyMs: 0 });
  const rgRepo = new ResponsibleGamblingRepository();

  const server = createApiServer(0);
  const router = Router();
  router.use(
    '/auth',
    await createAuthRoutes({
      userRepository: userRepo,
      walletRepository: walletRepo,
      ledgerRepository: ledgrRepo,
      jwtService,
    }),
  );
  router.use(
    '/wallets',
    await createWalletRoutes({
      walletRepository: walletRepo,
      ledgerRepository: ledgrRepo,
      pixProvider,
      userRepository: userRepo,
      responsibleGamblingRepository: rgRepo,
    }),
  );
  router.use(
    '/bets',
    await createBetRoutes({
      betRepository: betRepo,
      eventRepository: eventRepo,
      walletRepository: walletRepo,
      ledgerRepository: ledgrRepo,
      responsibleGamblingRepository: rgRepo,
    }),
  );
  router.use(
    '/admin',
    await createAdminRoutes({
      betRepository: betRepo,
      eventRepository: eventRepo,
      riskRepository: riskRepo,
      walletRepository: walletRepo,
      ledgerRepository: ledgrRepo,
      houseTreasuryRepository: new HouseTreasuryRepository(),
      dependencyHealthProvider: () => ({ redis: -1, mongo: -1 }),
    }),
  );

  server.registerHealthCheck();
  server.registerRoutes(router, '');
  server.registerErrorHandler();
  server.get404Handler();

  app = server.getExpressApp();
}

let registerSeq = 0;
async function registerAndLogin(prefix: string) {
  registerSeq += 1;
  const email = `${prefix}${registerSeq}@example.com`;
  const payload = {
    email,
    password: PASSWORD,
    username: `${prefix}${registerSeq}_user`,
    firstName: 'Settle',
    lastName: 'Test',
  };
  const reg = await request(app).post('/api/v1/auth/register').send(payload);
  expect(reg.status).toBe(201);
  const login = await request(app).post('/api/v1/auth/login').send({
    email,
    password: PASSWORD,
  });
  expect(login.status).toBe(200);
  const data = login.body.data;
  return {
    userId: data.user.id as string,
    accessToken: data.accessToken as string,
  };
}

async function fundWallet(accessToken: string, amount = 500): Promise<void> {
  const res = await request(app)
    .post('/api/v1/wallets/deposit')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ amount, currency: 'BRL', description: 'seed' });
  expect(res.status).toBe(201);
}

async function placeBet(accessToken: string, amount = 100): Promise<{ id: string }> {
  const res = await request(app)
    .post('/api/v1/bets')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      eventId: FOOTBALL_EVENT,
      marketId: MARKET_ID,
      oddId: ODD_ID,
      amount,
      type: 'SINGLE',
    });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function walletBalance(accessToken: string): Promise<{ balance: number; lockedBalance: number }> {
  const res = await request(app)
    .get('/api/v1/wallets/me')
    .set('Authorization', `Bearer ${accessToken}`);
  expect(res.status).toBe(200);
  return { balance: res.body.data.balance, lockedBalance: res.body.data.lockedBalance };
}

function settle(
  accessToken: string,
  betId: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  let req = request(app)
    .post(`/api/v1/admin/bets/${betId}/settle`)
    .set('Authorization', `Bearer ${accessToken}`);
  if (idempotencyKey) {
    req = req.set('Idempotency-Key', idempotencyKey);
  }
  return req.send(body);
}

describe('Settlement via HTTP — cenários críticos (Fase 20)', () => {
  beforeAll(async () => {
    await buildTestApp();
  });

  afterAll(() => {
    appConfig.admin.allowedUserIds = [];
  });

  it('liquida WON: credita o retorno potencial no saldo e marca a aposta como ganha', async () => {
    const user = await registerAndLogin('won');
    await fundWallet(user.accessToken, 500);
    const bet = await placeBet(user.accessToken, 100);

    expect((await walletBalance(user.accessToken)).balance).toBe(400);

    appConfig.admin.allowedUserIds = [user.userId];
    try {
      const res = await settle(user.accessToken, bet.id, {
        result: 'WON',
        marketResult: 'home',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('WON');
    } finally {
      appConfig.admin.allowedUserIds = [];
    }

    expect((await walletBalance(user.accessToken)).balance).toBe(590);
    expect((await walletBalance(user.accessToken)).lockedBalance).toBe(0);
  });

  it('liquida LOST: não credita nada e marca a aposta como perdida', async () => {
    const user = await registerAndLogin('lost');
    await fundWallet(user.accessToken, 500);
    const bet = await placeBet(user.accessToken, 100);

    appConfig.admin.allowedUserIds = [user.userId];
    try {
      const res = await settle(user.accessToken, bet.id, {
        result: 'LOST',
        marketResult: 'away',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('LOST');
    } finally {
      appConfig.admin.allowedUserIds = [];
    }

    expect((await walletBalance(user.accessToken)).balance).toBe(400);
  });

  it('liquidação duplicada com Idempotency-Key: replay sem pagar duas vezes', async () => {
    const user = await registerAndLogin('dup');
    await fundWallet(user.accessToken, 500);
    const bet = await placeBet(user.accessToken, 100);

    appConfig.admin.allowedUserIds = [user.userId];
    try {
      const first = await settle(user.accessToken, bet.id, {
        result: 'WON',
        marketResult: 'home',
      }, 'settle-dup-1');
      expect(first.status).toBe(200);
      expect((await walletBalance(user.accessToken)).balance).toBe(590);

      const replay = await settle(user.accessToken, bet.id, {
        result: 'WON',
        marketResult: 'home',
      }, 'settle-dup-1');
      expect(replay.status).toBe(200);
      expect(replay.body.data.status).toBe('WON');
      expect((await walletBalance(user.accessToken)).balance).toBe(590);
    } finally {
      appConfig.admin.allowedUserIds = [];
    }
  });

  it('resultado inválido: rejeita com 400 e não altera o estado da aposta', async () => {
    const user = await registerAndLogin('invalid');
    await fundWallet(user.accessToken, 500);
    const bet = await placeBet(user.accessToken, 100);

    appConfig.admin.allowedUserIds = [user.userId];
    try {
      const res = await settle(user.accessToken, bet.id, {
        result: 'WIN',
        marketResult: 'home',
      });
      expect(res.status).toBe(400);
    } finally {
      appConfig.admin.allowedUserIds = [];
    }

    expect((await walletBalance(user.accessToken)).balance).toBe(400);
  });

  it('usuário não-admin: bloqueado com 403', async () => {
    const user = await registerAndLogin('forbidden');
    await fundWallet(user.accessToken, 500);
    const bet = await placeBet(user.accessToken, 100);

    const res = await settle(user.accessToken, bet.id, {
      result: 'WON',
      marketResult: 'home',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect((await walletBalance(user.accessToken)).balance).toBe(400);
  });
});