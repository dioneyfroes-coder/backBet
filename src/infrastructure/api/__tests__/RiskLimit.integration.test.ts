process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

import request from 'supertest';
import express, { Router } from 'express';
import { createApiServer } from '@/infrastructure/api/ApiServer';
import { createAuthRoutes } from '@/infrastructure/api/routes/authRoutes';
import { createUserRoutes } from '@/infrastructure/api/routes/userRoutes';
import { createWalletRoutes } from '@/infrastructure/api/routes/walletRoutes';
import { createBetRoutes } from '@/infrastructure/api/routes/betRoutes';
import { createAdminRoutes } from '@/infrastructure/api/routes/adminRoutes';
import { UserRepository } from '@/core/user/domain/repositories/UserRepository';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { BetRepository } from '@/core/betting/domain/repositories/BetRepository';
import { EventRepository } from '@/core/betting/domain/repositories/EventRepository';
import { WithdrawalRequestRepository } from '@/core/finance/domain/repositories/WithdrawalRequestRepository';
import { InMemoryLedgerRepository } from '@/core/finance/domain/repositories/InMemoryLedgerRepository';
import { InMemoryRiskRepository } from '@/infrastructure/persistence/inmemory/repositories/InMemoryRiskRepository';
import { CreditPackageRepository } from '@/core/finance/domain/repositories/CreditPackageRepository';
import { HouseTreasuryRepository } from '@/core/treasury/domain/repositories/HouseTreasuryRepository';
import { Event, Market } from '@/core/betting/domain/entities/Event';
import { Odds } from '@/core/odds/domain/value-objects/Odds';
import { JwtService } from '@/shared/services/JwtService';
import { MockPixProvider } from '@/infrastructure/payments/pix/MockPixProvider';
import { RISK_CONFIG } from '@/core/risk/config/risk-config';
import { appConfig } from '@/shared/config/appConfig';
import { IdentityVerificationRepository } from '@/core/compliance/domain/repositories/IdentityVerificationRepository';
import { ResponsibleGamblingRepository } from '@/core/responsibleGambling/domain/repositories/ResponsibleGamblingRepository';
import { MockKycProvider } from '@/infrastructure/compliance/MockKycProvider';

jest.setTimeout(30000);

const PASSWORD = 'Password123!';
const FOOTBALL_EVENT = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const MARKET_ID = 'mkt-1x2';
const HOME_ODD_ID = 'home';

const DEFAULT_USER_LIMIT = RISK_CONFIG.MAX_EXPOSURE_PER_USER;
const DEFAULT_BLACKLIST = [...RISK_CONFIG.BLACKLIST_USER_IDS];

let app: express.Express;
let userRepo: UserRepository;
let walletRepo: WalletRepository;
let ledgrRepo: InMemoryLedgerRepository;
let betRepo: BetRepository;
let eventRepo: EventRepository;
let withdrawalRepo: WithdrawalRequestRepository;
let identityVerificationRepo: IdentityVerificationRepository;
let responsibleGamblingRepo: ResponsibleGamblingRepository;

async function buildTestApp(): Promise<void> {
  appConfig.admin.allowedUserIds = [];

  userRepo = new UserRepository();
  walletRepo = new WalletRepository();
  ledgrRepo = new InMemoryLedgerRepository();
  betRepo = new BetRepository();
  eventRepo = new EventRepository();
  withdrawalRepo = new WithdrawalRequestRepository();
  identityVerificationRepo = new IdentityVerificationRepository();
  responsibleGamblingRepo = new ResponsibleGamblingRepository();
  const creditPackageRepo = new CreditPackageRepository();
  const riskRepo = new InMemoryRiskRepository();
  const jwtService = new JwtService();
  const pixProvider = new MockPixProvider({ latencyMs: 0 });

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
    '/users',
    await createUserRoutes({
      userRepository: userRepo,
      identityVerificationRepository: identityVerificationRepo,
      responsibleGamblingRepository: responsibleGamblingRepo,
      complianceProviders: { kyc: new MockKycProvider() },
    }),
  );
  router.use(
    '/wallets',
    await createWalletRoutes({
      walletRepository: walletRepo,
      ledgerRepository: ledgrRepo,
      pixProvider,
      userRepository: userRepo,
      responsibleGamblingRepository: responsibleGamblingRepo,
    }),
  );
  router.use(
    '/bets',
    await createBetRoutes({
      betRepository: betRepo,
      eventRepository: eventRepo,
      walletRepository: walletRepo,
      ledgerRepository: ledgrRepo,
      responsibleGamblingRepository: responsibleGamblingRepo,
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

async function registerAndLogin(prefix: string) {
  const payload = {
    email: `${prefix}@example.com`,
    password: PASSWORD,
    username: `${prefix}_user`,
    firstName: 'Risk',
    lastName: 'Limit',
  };
  const reg = await request(app).post('/api/auth/register').send(payload);
  expect(reg.status).toBe(201);
  const login = await request(app).post('/api/auth/login').send({
    email: payload.email,
    password: PASSWORD,
  });
  expect(login.status).toBe(200);
  const data = login.body.data;
  return {
    ...payload,
    userId: data.user.id,
    accessToken: data.accessToken as string,
  };
}

async function fundWallet(accessToken: string, amount: number): Promise<void> {
  const res = await request(app)
    .post('/api/wallets/deposit')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ amount, currency: 'BRL', description: 'seed' });
  expect(res.status).toBe(201);
}

async function seedScheduledEvent(): Promise<void> {
  const event = new Event(
    FOOTBALL_EVENT,
    'Risk Limit Match',
    new Date(Date.now() + 60 * 60 * 1000),
    'SCHEDULED',
    'Football',
    ['FC Safe', 'Dev Secure'],
    new Map([
      [
        MARKET_ID,
        new Market(
          MARKET_ID,
          'Vencedor',
          'OPEN',
          new Map([[HOME_ODD_ID, new Odds(2.0)]]),
        ),
      ],
    ]),
  );
  await eventRepo.create(event);
}

async function placeBet(accessToken: string, amount: number) {
  return request(app)
    .post('/api/bets')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      eventId: FOOTBALL_EVENT,
      marketId: MARKET_ID,
      oddId: HOME_ODD_ID,
      amount,
      type: 'SINGLE',
    });
}

async function walletBalance(accessToken: string): Promise<number> {
  const res = await request(app)
    .get('/api/wallets/me')
    .set('Authorization', `Bearer ${accessToken}`);
  expect(res.status).toBe(200);
  return res.body.data.balance as number;
}

describe('Risk Fase 20.1 — Limite de exposição rejeita aposta via HTTP', () => {
  beforeEach(async () => {
    await buildTestApp();
  });

  afterEach(() => {
    RISK_CONFIG.MAX_EXPOSURE_PER_USER = DEFAULT_USER_LIMIT;
    RISK_CONFIG.BLACKLIST_USER_IDS.splice(0, RISK_CONFIG.BLACKLIST_USER_IDS.length, ...DEFAULT_BLACKLIST);
  });

  it('rejeita aposta que estouraria o limite de exposição (400 RISK_REJECTED) sem debitar a carteira', async () => {
    RISK_CONFIG.MAX_EXPOSURE_PER_USER = 90;
    await seedScheduledEvent();

    const user = await registerAndLogin('risklmt1');
    await fundWallet(user.accessToken, 500);
    expect(await walletBalance(user.accessToken)).toBe(500);

    const first = await placeBet(user.accessToken, 50);
    expect(first.status).toBe(201);

    const blocked = await placeBet(user.accessToken, 60);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.code).toBe('RISK_REJECTED');
    expect(await walletBalance(user.accessToken)).toBe(450);

    const myBets = await request(app)
      .get('/api/bets/me')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(myBets.status).toBe(200);
    expect(myBets.body.data.bets.length).toBe(1);

    const within = await placeBet(user.accessToken, 30);
    expect(within.status).toBe(201);
    expect(await walletBalance(user.accessToken)).toBe(420);
  });

  it('rejeita aposta de usuário blacklisted (400 RISK_REJECTED) sem debitar a carteira', async () => {
    await seedScheduledEvent();
    const user = await registerAndLogin('riskbl1');
    await fundWallet(user.accessToken, 200);
    RISK_CONFIG.BLACKLIST_USER_IDS.push(user.userId);

    const blocked = await placeBet(user.accessToken, 20);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.code).toBe('RISK_REJECTED');
    expect(await walletBalance(user.accessToken)).toBe(200);

    const myBets = await request(app)
      .get('/api/bets/me')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(myBets.status).toBe(200);
    expect(myBets.body.data.bets.length).toBe(0);
  });
});