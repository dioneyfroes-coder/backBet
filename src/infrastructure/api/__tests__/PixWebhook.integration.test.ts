process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

import request from 'supertest';
import express, { Router } from 'express';
import { createApiServer } from '@/infrastructure/api/ApiServer';
import { createAuthRoutes } from '@/infrastructure/api/routes/authRoutes';
import { createWalletRoutes } from '@/infrastructure/api/routes/walletRoutes';
import { createPixWebhookRoutes } from '@/infrastructure/api/routes/pixWebhookRoutes';
import { UserRepository } from '@/core/user/domain/repositories/UserRepository';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { InMemoryLedgerRepository } from '@/core/finance/domain/repositories/InMemoryLedgerRepository';
import { ResponsibleGamblingRepository } from '@/core/responsibleGambling/domain/repositories/ResponsibleGamblingRepository';
import { JwtService } from '@/shared/services/JwtService';
import {
  MockPixProvider,
  MockPixProviderOptions,
} from '@/infrastructure/payments/pix/MockPixProvider';
import { appConfig } from '@/shared/config/appConfig';
import { signWebhookBody } from '@/shared/services/webhookSignature';

jest.setTimeout(30000);

const PASSWORD = 'Password123!';

let app: express.Express;
let userRepo: UserRepository;
let walletRepo: WalletRepository;
let ledgrRepo: InMemoryLedgerRepository;

const makePixProvider = (options?: MockPixProviderOptions): MockPixProvider =>
  new MockPixProvider({ latencyMs: 0, ...options });

async function buildTestApp(pixProvider: MockPixProvider): Promise<void> {
  userRepo = new UserRepository();
  walletRepo = new WalletRepository();
  ledgrRepo = new InMemoryLedgerRepository();
  const jwtService = new JwtService();
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
    '/webhooks',
    await createPixWebhookRoutes({
      walletRepository: walletRepo,
      ledgerRepository: ledgrRepo,
      pixProvider,
    }),
  );

  server.registerHealthCheck();
  server.registerRoutes(router, '');
  server.registerErrorHandler();

  app = server.getExpressApp();
}

let registerSeq = 0;
async function registerAndLogin(): Promise<{ userId: string; accessToken: string }> {
  registerSeq += 1;
  const email = `pixwh${registerSeq}@example.com`;
  const payload = {
    email,
    password: PASSWORD,
    username: `pixwh${registerSeq}_user`,
    firstName: 'Pix',
    lastName: 'Webhook',
  };
  const reg = await request(app).post('/api/v1/auth/register').send(payload);
  expect(reg.status).toBe(201);
  const login = await request(app).post('/api/v1/auth/login').send({
    email,
    password: PASSWORD,
  });
  expect(login.status).toBe(200);
  const data = login.body.data;
  return { userId: data.user.id as string, accessToken: data.accessToken as string };
}

async function createCharge(accessToken: string, amount = 100) {
  const res = await request(app)
    .post('/api/v1/wallets/deposit/pix-charge')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ amount, currency: 'BRL' });
  return res;
}

async function sendWebhook(options: {
  type?: 'PIX_PAID' | 'PIX_REFUNDED' | 'PIX_CANCELED';
  chargeId: string;
  reference: string;
  amount: number;
  currency?: 'BRL' | 'USD' | 'EUR';
  rawBodyOverride?: string;
  signatureOverride?: string;
  secretOverride?: string;
}) {
  const { type = 'PIX_PAID', chargeId, reference, amount, currency = 'BRL' } = options;
  const canonical = { type, chargeId, reference, amount, currency };
  const rawBody = options.rawBodyOverride ?? JSON.stringify(canonical);
  const secret = options.secretOverride ?? appConfig.payments.pix.webhookSecret;
  const signature =
    options.signatureOverride ?? signWebhookBody(rawBody, secret);
  return request(app)
    .post('/api/v1/webhooks/pix')
    .set('X-BackBet-Signature', signature)
    .set('Content-Type', 'application/json')
    .send(rawBody);
}

async function walletBalance(accessToken: string): Promise<number> {
  const res = await request(app)
    .get('/api/v1/wallets/me')
    .set('Authorization', `Bearer ${accessToken}`);
  expect(res.status).toBe(200);
  return res.body.data.balance as number;
}

const freshApp = () => makePixProvider();

describe('Pix webhook via HTTP — P1 a P7 (Fase 18)', () => {
  beforeAll(async () => {
    await buildTestApp(freshApp());
  });

  it('P4: confirmação PIX_PAID credita o depósito (charge criada sem crédito)', async () => {
    const { accessToken } = await registerAndLogin();
    const chargeRes = await createCharge(accessToken, 100);
    expect(chargeRes.status).toBe(201);
    const chargePix = chargeRes.body.data.pix;

    expect(await walletBalance(accessToken)).toBe(0);

    const wh = await sendWebhook({
      chargeId: chargePix.chargeId,
      reference: chargePix.reference,
      amount: 100,
    });

    expect(wh.status).toBe(200);
    expect(wh.body.data.action).toBe('credited');
    expect(await walletBalance(accessToken)).toBe(100);
  });

  it('P1: webhook duplicado não credita duas vezes', async () => {
    const { accessToken } = await registerAndLogin();
    const chargeRes = await createCharge(accessToken, 50);
    const chargePix = chargeRes.body.data.pix;

    await sendWebhook({ chargeId: chargePix.chargeId, reference: chargePix.reference, amount: 50 });
    const balanceAfterFirst = await walletBalance(accessToken);
    expect(balanceAfterFirst).toBe(50);

    const dup = await sendWebhook({
      chargeId: chargePix.chargeId,
      reference: chargePix.reference,
      amount: 50,
    });
    expect(dup.status).toBe(200);
    expect(dup.body.data.action).toBe('replayed');
    expect(await walletBalance(accessToken)).toBe(50);
  });

  it('P2: assinatura inválida é rejeitada (401)', async () => {
    const { accessToken } = await registerAndLogin();
    const chargeRes = await createCharge(accessToken, 30);
    const chargePix = chargeRes.body.data.pix;

    const wh = await sendWebhook({
      chargeId: chargePix.chargeId,
      reference: chargePix.reference,
      amount: 30,
      signatureOverride: 'deadbeef',
    });

    expect(wh.status).toBe(401);
    expect(wh.body.error.code).toBe('PIX_WEBHOOK_SIGNATURE_INVALID');
    expect(await walletBalance(accessToken)).toBe(0);
  });

  it('P2 (b): payload com type inválido é rejeitado (400/422)', async () => {
    const rawBody = JSON.stringify({
      type: 'NOT_A_TYPE',
      chargeId: 'x',
      reference: 'r',
      amount: 10,
      currency: 'BRL',
    });
    const signature = signWebhookBody(rawBody, appConfig.payments.pix.webhookSecret);
    const wh = await request(app)
      .post('/api/v1/webhooks/pix')
      .set('X-BackBet-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(rawBody);
    expect(wh.status).toBe(400);
  });

  it('P3: pagamento de charge expirada não credita', async () => {
    const expiredProvider = makePixProvider({ chargeTtlMs: -60000 });
    await buildTestApp(expiredProvider);
    const { accessToken } = await registerAndLogin();
    const chargeRes = await createCharge(accessToken, 40);
    const chargePix = chargeRes.body.data.pix;

    const wh = await sendWebhook({
      chargeId: chargePix.chargeId,
      reference: chargePix.reference,
      amount: 40,
    });

    expect(wh.status).toBe(200);
    expect(wh.body.data.action).toBe('expired_ignored');
    expect(await walletBalance(accessToken)).toBe(0);

    await buildTestApp(freshApp());
  });

  it('P5: PIX_REFUNDED após crédito estorna o valor', async () => {
    const { accessToken } = await registerAndLogin();
    const chargeRes = await createCharge(accessToken, 80);
    const chargePix = chargeRes.body.data.pix;

    await sendWebhook({ chargeId: chargePix.chargeId, reference: chargePix.reference, amount: 80 });
    expect(await walletBalance(accessToken)).toBe(80);

    const refund = await sendWebhook({
      type: 'PIX_REFUNDED',
      chargeId: chargePix.chargeId,
      reference: chargePix.reference,
      amount: 80,
    });
    expect(refund.status).toBe(200);
    expect(refund.body.data.action).toBe('refunded');
    expect(await walletBalance(accessToken)).toBe(0);
  });

  it('P5 (b): PIX_CANCELED de charge nunca paga não debita', async () => {
    const { accessToken } = await registerAndLogin();
    const chargeRes = await createCharge(accessToken, 25);
    const chargePix = chargeRes.body.data.pix;

    const cancel = await sendWebhook({
      type: 'PIX_CANCELED',
      chargeId: chargePix.chargeId,
      reference: chargePix.reference,
      amount: 25,
    });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.action).toBe('canceled');
    expect(await walletBalance(accessToken)).toBe(0);
  });

  it('P6: valor divergente é rejeitado (422) e não credita', async () => {
    const { accessToken } = await registerAndLogin();
    const chargeRes = await createCharge(accessToken, 60);
    const chargePix = chargeRes.body.data.pix;

    const wh = await sendWebhook({
      chargeId: chargePix.chargeId,
      reference: chargePix.reference,
      amount: 999,
    });
    expect(wh.status).toBe(422);
    expect(wh.body.error.code).toBe('PIX_WEBHOOK_AMOUNT_MISMATCH');
    expect(await walletBalance(accessToken)).toBe(0);
  });

  it('P7: reference divergente é rejeitado (422) e não credita', async () => {
    const { accessToken } = await registerAndLogin();
    const chargeRes = await createCharge(accessToken, 70);
    const chargePix = chargeRes.body.data.pix;

    const wh = await sendWebhook({
      chargeId: chargePix.chargeId,
      reference: 'reference_inventada',
      amount: 70,
    });
    expect(wh.status).toBe(422);
    expect(wh.body.error.code).toBe('PIX_WEBHOOK_REFERENCE_MISMATCH');
    expect(await walletBalance(accessToken)).toBe(0);
  });

  it('header de assinatura ausente retorna 401', async () => {
    const rawBody = JSON.stringify({
      type: 'PIX_PAID',
      chargeId: 'charge-any',
      reference: 'r',
      amount: 10,
      currency: 'BRL',
    });
    const wh = await request(app)
      .post('/api/v1/webhooks/pix')
      .set('Content-Type', 'application/json')
      .send(rawBody);
    expect(wh.status).toBe(401);
  });
});