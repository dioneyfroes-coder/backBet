process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

import request from 'supertest';
import express, { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApiServer } from '@/infrastructure/api/ApiServer';
import { createAuthRoutes } from '@/infrastructure/api/routes/authRoutes';
import { createUserRoutes } from '@/infrastructure/api/routes/userRoutes';
import { createWalletRoutes } from '@/infrastructure/api/routes/walletRoutes';
import { createBetRoutes } from '@/infrastructure/api/routes/betRoutes';
import { createFinanceRoutes } from '@/infrastructure/api/routes/financeRoutes';
import { createAdminRoutes } from '@/infrastructure/api/routes/adminRoutes';
import { createPasswordRecoveryRoutes } from '@/infrastructure/api/routes/passwordRecoveryRoutes';
import { UserRepository } from '@/core/user/domain/repositories/UserRepository';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { BetRepository } from '@/core/betting/domain/repositories/BetRepository';
import { EventRepository } from '@/core/betting/domain/repositories/EventRepository';
import { CreditPackageRepository } from '@/core/finance/domain/repositories/CreditPackageRepository';
import { WithdrawalRequestRepository } from '@/core/finance/domain/repositories/WithdrawalRequestRepository';
import { InMemoryLedgerRepository } from '@/core/finance/domain/repositories/InMemoryLedgerRepository';
import { InMemoryRiskRepository } from '@/infrastructure/persistence/inmemory/repositories/InMemoryRiskRepository';
import { HouseTreasuryRepository } from '@/core/treasury/domain/repositories/HouseTreasuryRepository';
import { Event, Market } from '@/core/betting/domain/entities/Event';
import { Odds } from '@/core/odds/domain/value-objects/Odds';
import { JwtService } from '@/shared/services/JwtService';
import { MockPixProvider } from '@/infrastructure/payments/pix/MockPixProvider';
import { appConfig } from '@/shared/config/appConfig';
import { IdentityVerificationRepository } from '@/core/compliance/domain/repositories/IdentityVerificationRepository';
import { ResponsibleGamblingRepository } from '@/core/responsibleGambling/domain/repositories/ResponsibleGamblingRepository';
import { MockKycProvider } from '@/infrastructure/compliance/MockKycProvider';

jest.setTimeout(30000);

const PASSWORD = 'Password123!';
const SEC_EVENT_ID = '8f8f3dd0-7b90-4f11-a4a5-1234567890ab';
const SEC_MARKET_ID = 'mkt-sec';
const SEC_HOME_ODD_ID = 'home';
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_RUNTIME_ENV = process.env.BACKBET_RUNTIME_ENV;

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
  router.use('/auth', createPasswordRecoveryRoutes({ userRepository: userRepo }));
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
    '/finance',
    await createFinanceRoutes({
      walletRepository: walletRepo,
      ledgerRepository: ledgrRepo,
      creditPackageRepository: creditPackageRepo,
      withdrawalRequestRepository: withdrawalRepo,
      userRepository: userRepo,
      identityVerificationRepository: identityVerificationRepo,
      complianceProviders: { kyc: new MockKycProvider() },
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
    firstName: 'Sec',
    lastName: 'Test',
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
    refreshToken: data.refreshToken as string,
    sessionId: data.sessionId as string,
  };
}

async function fundWallet(accessToken: string, amount = 200): Promise<void> {
  const res = await request(app)
    .post('/api/wallets/deposit')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ amount, currency: 'BRL', description: 'seed' });
  expect(res.status).toBe(201);
}

async function seedScheduledEvent(): Promise<void> {
  const event = new Event(
    SEC_EVENT_ID,
    'Security Match',
    new Date(Date.now() + 60 * 60 * 1000),
    'SCHEDULED',
    'Football',
    ['FC Safe', 'Dev Secure'],
    new Map([
      [
        SEC_MARKET_ID,
        new Market(
          SEC_MARKET_ID,
          'Vencedor',
          'OPEN',
          new Map([[SEC_HOME_ODD_ID, new Odds(2.0)]]),
        ),
      ],
    ]),
  );
  await eventRepo.create(event);
}

const forgeAccessToken = (
  userId: string,
  sessionId: string,
  secret: string = appConfig.jwt.secret,
  kind: 'access' | 'refresh' = 'access',
  expiresIn: string | undefined = '1h',
): string => {
  const options: jwt.SignOptions = {
    algorithm: 'HS256',
    issuer: appConfig.jwt.issuer,
    ...(expiresIn ? { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] } : {}),
  };
  return jwt.sign({ userId, sessionId, kind }, secret, options);
};

describe('Security Fase 12 — Authentication hardening', () => {
  beforeEach(async () => {
    await buildTestApp();
  });

  it('stores passwords with bcrypt cost 12', async () => {
    const a = await registerAndLogin('hashcost');
    const user = await userRepo.findById(a.userId);
    expect(user?.passwordHash).toBeTruthy();
    expect(bcrypt.getRounds(user!.passwordHash)).toBe(12);
    const valid = await bcrypt.compare(PASSWORD, user!.passwordHash);
    expect(valid).toBe(true);
  });

  it('issues access and refresh tokens with exp claim and expected kind', async () => {
    const a = await registerAndLogin('claims');
    const accessPayload = jwt.decode(a.accessToken) as { kind?: string; exp?: number; iss?: string };
    const refreshPayload = jwt.decode(a.refreshToken) as {
      kind?: string;
      exp?: number;
      iss?: string;
    };
    expect(accessPayload.kind).toBe('access');
    expect(refreshPayload.kind).toBe('refresh');
    expect(accessPayload.exp).toBeGreaterThan(Date.now() / 1000);
    expect(refreshPayload.exp).toBeGreaterThan((Date.now() + 7 * 24 * 3600 * 1000) / 1000 - 60);
    expect(accessPayload.iss).toBe(appConfig.jwt.issuer);
  });

  it('rejects access tokens that are actually refresh tokens', async () => {
    const a = await registerAndLogin('kindswitch');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${a.refreshToken}`);
    expect(res.status).toBe(401);
  });

  it('rejects refresh of a token that is not a refresh token', async () => {
    const a = await registerAndLogin('notrefresh');
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: a.accessToken });
    expect(res.status).toBe(401);
  });

  it('performs a valid refresh flow with new tokens', async () => {
    const a = await registerAndLogin('refreshok');
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: a.refreshToken });
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.accessToken).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
    expect(data.user.id).toBe(a.userId);
  });

  it('rejects tokens signed with an unknown secret (forgery)', async () => {
    const forged = forgeAccessToken('attacker', 'session-1', 'this-is-not-the-secret');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects expired access tokens', async () => {
    const a = await registerAndLogin('expired');
    const expired = forgeAccessToken(a.userId, a.sessionId, appConfig.jwt.secret, 'access', '-1s');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('brute force login is throttled to 429', async () => {
    let lastRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'WrongPass1!' });
    expect(lastRes.status).toBe(401);
    const statuses: number[] = [lastRes.status];
    for (let i = 0; i < 20; i++) {
      lastRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: `WrongPass${i}!` });
      statuses.push(lastRes.status);
    }
    expect(statuses).toContain(429);
  });

  it('does not leak whether an email is registered on login', async () => {
    const a = await registerAndLogin('enumlogin');
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: a.email, password: 'WrongPass1!' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'WrongPass1!' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error?.message).toBe(unknownEmail.body.error?.message);
  });

  it('does not leak whether an email is registered on password recovery', async () => {
    const a = await registerAndLogin('enumrecovery');
    const existing = await request(app)
      .post('/api/auth/request-password-recovery')
      .send({ email: a.email });
    const unknown = await request(app)
      .post('/api/auth/request-password-recovery')
      .send({ email: 'nobody@example.com' });
    expect(existing.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(existing.body.message).toBe(unknown.body.message);
  });
});

describe('Security Fase 12 — Authorization (403)', () => {
  beforeEach(async () => {
    await buildTestApp();
  });

  it('returns 401 without a valid token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a garbage bearer token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('blocks a regular user from admin endpoints (403)', async () => {
    const a = await registerAndLogin('notadmin');
    const overview = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${a.accessToken}`);
    const risk = await request(app)
      .get(`/api/admin/risk/users/${a.userId}`)
      .set('Authorization', `Bearer ${a.accessToken}`);
    const treasury = await request(app)
      .get('/api/admin/treasury/summary')
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(overview.status).toBe(403);
    expect(risk.status).toBe(403);
    expect(treasury.status).toBe(403);
  });

  it('allows a configured admin through admin endpoints', async () => {
    const a = await registerAndLogin('realadmin');
    appConfig.admin.allowedUserIds = [a.userId];
    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(res.status).toBe(200);
  });

  it('blocks a user from canceling another user bet (403) and allows the owner', async () => {
    await seedScheduledEvent();
    const owner = await registerAndLogin('betowner');
    const intruder = await registerAndLogin('betintruder');
    await fundWallet(owner.accessToken);
    const placed = await request(app)
      .post('/api/bets')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        eventId: SEC_EVENT_ID,
        marketId: SEC_MARKET_ID,
        oddId: SEC_HOME_ODD_ID,
        amount: 10,
        type: 'SINGLE',
      });
    expect(placed.status).toBe(201);
    const betId = placed.body.data.id;

    const denied = await request(app)
      .post(`/api/bets/${betId}/cancel`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .send({ reason: 'intruder' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('BET_NOT_OWNER');

    const ownerCancel = await request(app)
      .post(`/api/bets/${betId}/cancel`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ reason: 'owner cancel' });
    expect(ownerCancel.status).toBe(200);
  });

  it('allows a configured admin to cancel another user bet', async () => {
    await seedScheduledEvent();
    const owner = await registerAndLogin('betowner2');
    const admin = await registerAndLogin('admin2');
    appConfig.admin.allowedUserIds = [admin.userId];
    await fundWallet(owner.accessToken);
    const placed = await request(app)
      .post('/api/bets')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        eventId: SEC_EVENT_ID,
        marketId: SEC_MARKET_ID,
        oddId: SEC_HOME_ODD_ID,
        amount: 10,
        type: 'SINGLE',
      });
    expect(placed.status).toBe(201);

    const res = await request(app)
      .post(`/api/bets/${placed.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'admin cancel' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELED');
  });

  it('blocks a regular user from processing another user withdrawal request (403)', async () => {
    const alice = await registerAndLogin('alice');
    const bob = await registerAndLogin('bob');
    await fundWallet(alice.accessToken);

    const created = await request(app)
      .post('/api/finance/withdrawal-requests')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ amount: 100, currency: 'BRL', password: PASSWORD });
    expect(created.status).toBe(201);
    const requestId = created.body.data.withdrawalRequest.id;

    const denied = await request(app)
      .patch(`/api/finance/withdrawal-requests/${requestId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ action: 'REJECTED', notes: 'bob meddling' });
    expect(denied.status).toBe(403);
  });

  it('allows an admin to process a withdrawal request', async () => {
    const alice = await registerAndLogin('alice2');
    const admin = await registerAndLogin('admin3');
    appConfig.admin.allowedUserIds = [admin.userId];
    await fundWallet(alice.accessToken);

    const created = await request(app)
      .post('/api/finance/withdrawal-requests')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ amount: 100, currency: 'BRL', password: PASSWORD });
    const requestId = created.body.data.withdrawalRequest.id;

    const res = await request(app)
      .patch(`/api/finance/withdrawal-requests/${requestId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ action: 'REJECTED', notes: 'approved by admin' });
    expect(res.status).toBe(200);
  });

  it('never leaks another user wallet balance', async () => {
    const a = await registerAndLogin('walleta');
    const b = await registerAndLogin('walletb');
    await fundWallet(a.accessToken, 500);

    const aBalance = await request(app)
      .get('/api/wallets/me')
      .set('Authorization', `Bearer ${a.accessToken}`);
    const bBalance = await request(app)
      .get('/api/wallets/me')
      .set('Authorization', `Bearer ${b.accessToken}`);
    expect(aBalance.status).toBe(200);
    expect(bBalance.status).toBe(200);
    expect(aBalance.body.data.balance).toBe(500);
    expect(bBalance.body.data.balance).toBe(0);
  });
});

describe('Security Fase 13 — Segurança específica de dinheiro', () => {
  beforeEach(async () => {
    await buildTestApp();
  });

  it('bloqueia depósito acima do máximo por operação (400)', async () => {
    const user = await registerAndLogin('msec1');
    const res = await request(app)
      .post('/api/wallets/deposit')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ amount: 6000, currency: 'BRL' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MONEY_SECURITY_DEPOSIT_MAX_AMOUNT');
  });

  it('bloqueia múltiplos saques rápidos via velocidade (429)', async () => {
    const user = await registerAndLogin('msec2');
    await fundWallet(user.accessToken, 1500);

    for (let i = 0; i < 3; i += 1) {
      const ok = await request(app)
        .post('/api/finance/withdrawal-requests')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ amount: 100, currency: 'BRL', password: PASSWORD });
      expect(ok.status).toBe(201);
    }

    const blocked = await request(app)
      .post('/api/finance/withdrawal-requests')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ amount: 100, currency: 'BRL', password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('MONEY_SECURITY_WITHDRAWAL_VELOCITY');
  });

  it('bloqueia saque logo após mudar a chave Pix (403)', async () => {
    const user = await registerAndLogin('msec3');
    await fundWallet(user.accessToken);

    const updated = await request(app)
      .put('/api/users/me/pix-key')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ pixKey: 'msec3@bank.example' });
    expect(updated.status).toBe(200);

    const blocked = await request(app)
      .post('/api/finance/withdrawal-requests')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ amount: 100, currency: 'BRL', password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('MONEY_SECURITY_PIX_CHANGED_RECENTLY');
  });
});

describe('Security Fase 14 — Compliance (KYC) e jogo responsável', () => {
  beforeEach(async () => {
    await buildTestApp();
  });

  it('exige identidade verificada para saques no/acima do limite (403 -> 201 após verificar)', async () => {
    const user = await registerAndLogin('comp1');
    await fundWallet(user.accessToken, 200);

    const blocked = await request(app)
      .post('/api/finance/withdrawal-requests')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ amount: 200, currency: 'BRL', password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('COMPLIANCE_IDENTITY_REQUIRED');

    const verified = await request(app)
      .post('/api/users/me/identity-verification')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ documentNumber: '12345678901', fullName: 'Sec Test' });
    expect(verified.status).toBe(200);
    expect(verified.body.data.verification.status).toBe('VERIFIED');

    const ok = await request(app)
      .post('/api/finance/withdrawal-requests')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ amount: 200, currency: 'BRL', password: PASSWORD });
    expect(ok.status).toBe(201);
  });

  it('rejeita documento sem formato CPF e mantém saque bloqueado', async () => {
    const user = await registerAndLogin('comp2');
    await fundWallet(user.accessToken, 200);

    const rejected = await request(app)
      .post('/api/users/me/identity-verification')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ documentNumber: '0001' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.verification.status).toBe('REJECTED');

    const blocked = await request(app)
      .post('/api/finance/withdrawal-requests')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ amount: 200, currency: 'BRL', password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('COMPLIANCE_IDENTITY_REQUIRED');
  });

  it('bloqueia depósito acima do limite diário de jogo responsável (403 -> 201)', async () => {
    const user = await registerAndLogin('rg1');
    const setLimit = await request(app)
      .patch('/api/users/me/responsible-gambling')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ depositLimit: { amountCents: 500, period: 'DAY' } });
    expect(setLimit.status).toBe(200);

    const over = await request(app)
      .post('/api/wallets/deposit')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ amount: 6, currency: 'BRL' });
    expect(over.status).toBe(403);
    expect(over.body.error.code).toBe('RESPONSIBLE_GAMBLING_DEPOSIT_LIMIT_EXCEEDED');

    const within = await request(app)
      .post('/api/wallets/deposit')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ amount: 4, currency: 'BRL' });
    expect(within.status).toBe(201);
  });

  it('autoexclusão bloqueia depósito (403)', async () => {
    const user = await registerAndLogin('rg2');
    const set = await request(app)
      .patch('/api/users/me/responsible-gambling')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ selfExclusionUntil: 'indefinite' });
    expect(set.status).toBe(200);
    expect(set.body.data.profile.selfExcluded).toBe(true);

    const blocked = await request(app)
      .post('/api/wallets/deposit')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ amount: 5, currency: 'BRL' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('RESPONSIBLE_GAMBLING_SELF_EXCLUDED');
  });
});

describe('Security Fase 12 — HTTP hardening', () => {
  beforeEach(async () => {
    await buildTestApp();
  });

  it('sends security headers from helmet', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it('blocks disallowed origins via CORS', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://evil.example.com')
      .send({ email: 'x@example.com', password: 'WrongPass1!' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows configured origins via CORS', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'x@example.com', password: 'WrongPass1!' });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('rejects oversized request bodies with 413', async () => {
    const huge = '{"x":"' + 'a'.repeat(11 * 1024 * 1024) + '"}';
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(huge);
    expect(res.status).toBe(413);
  });

  it('validates request payloads with 400 on malformed input', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short', username: '' });
    expect(res.status).toBe(400);
  });
});

describe('Security Fase 12 — Production profile', () => {
  it('enables HSTS only under production runtime', async () => {
    await jest.isolateModulesAsync(async () => {
      process.env.NODE_ENV = 'production';
      process.env.BACKBET_RUNTIME_ENV = 'production';
      process.env.JWT_SECRET = 'prod-test-secret';
      process.env.MONGODB_URI = 'mongodb://localhost:27017/backbet-test';
      process.env.REDIS_URL = 'redis://localhost:6379';

      const { createApiServer: createProdApiServer } = await import(
        '@/infrastructure/api/ApiServer'
      );
      const server = createProdApiServer(0);
      const prodApp = server.getExpressApp();
      server.registerErrorHandler();
      server.get404Handler();

      const noToken = await request(prodApp).get('/health');
      expect(noToken.headers['strict-transport-security']).toMatch(
        /max-age=15552000; includeSubDomains/i,
      );
    });
  });
});

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  process.env.BACKBET_RUNTIME_ENV = ORIGINAL_RUNTIME_ENV;
});