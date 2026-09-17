import { randomUUID } from 'crypto';
import { connectMongoDB, disconnectMongoDB, getMongoDBConfig } from '@/infrastructure/persistence/mongoose/config';
import { MongooseWalletRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseWalletRepository';
import { MongooseLedgerRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseLedgerRepository';
import { MongooseBetRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseBetRepository';
import { MongooseRiskRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseRiskRepository';
import { MongooseUserRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseUserRepository';
import { UserModel } from '@/infrastructure/persistence/mongoose/schemas/UserSchema';
import { WalletModel } from '@/infrastructure/persistence/mongoose/schemas/WalletSchema';
import { LedgerEntryModel } from '@/infrastructure/persistence/mongoose/schemas/LedgerEntrySchema';
import { BetModel } from '@/infrastructure/persistence/mongoose/schemas/BetSchema';
import { RiskProfileModel } from '@/infrastructure/persistence/mongoose/schemas/RiskProfileSchema';
import { RiskExposureCounterModel } from '@/infrastructure/persistence/mongoose/schemas/RiskExposureCounterSchema';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { BetService } from '@/core/betting/domain/services/BetService';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { RISK_CONFIG } from '@/core/risk/config/risk-config';
import { EventRepository } from '@/core/betting/domain/repositories/EventRepository';
import { Event, Market } from '@/core/betting/domain/entities/Event';
import { Odds } from '@/core/odds/domain/value-objects/Odds';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';

const runRealIntegration = process.env.RUN_REAL_INTEGRATION_TESTS === 'true';
const describeReal = runRealIntegration ? describe : describe.skip;

const MAX_RETRIES = 10_000;

// Fase 2b — Carga distribuída (MongoDB real): o MESMO parâmetro LOAD_SCALE que a
// suíte de contenção (load.concurrency), mas com o cenário invertido.
// Enquanto load.concurrency esmaga N depósitos na MESMA carteira (serialização do
// documento único — teto patológico), esta suíte mede o eixo HORIZONTAL: cada
// operação toca documento DISTINTO (carteira/usuário/evento próprios), com ondas
// de concorrência limitadas. Sem retry espúrio, sem timeout patológico — mede o
// throughput real do par API+Mongo com contenção removida.
const parsedScale = Number(process.env.LOAD_SCALE ?? '1');
const LOAD_SCALE = Number.isInteger(parsedScale) && parsedScale >= 1 ? parsedScale : 1;

const WALLETS = 100 * LOAD_SCALE;
const WAVE = Math.min(WALLETS, 100);
const DEPOSITS_PER_WALLET = 25;
const DEPOSIT_AMOUNT = 1.25;
const WITHDRAWALS_PER_WALLET = 25;
const WITHDRAWAL_AMOUNT = 2.0;
const FUNDING = 1000;
// 8 apostas × 100 = 800 ≤ saldo pós-saques (981,25): todas cobertas, rejeição = 0.
// (STAKE*BETS_PER_USER > saldo faria rejeições legítimas de fundos insuficientes,
// não é o objetivo desta suíte.)
const BETS_PER_USER = 8;
const STAKE = 100;
const ODDS_VALUE = 2.0;

const isConflict = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  (error as { code?: string }).code === 'CONFLICT';

const retryOnConflict = async <T>(operation: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (isConflict(error)) continue;
      throw error;
    }
  }
  throw new Error('Concorrência não convergiu (limite de retries atingido)');
};

const wallNow = (): { startedAt: number; mark: () => number } => {
  const startedAt = Date.now();
  return { startedAt, mark: () => Date.now() - startedAt };
};

const count = (rejected: unknown[]): string => `${rejected.length}`;

describeReal('Fase 2b — Carga distribuída (MongoDB real)', () => {
  jest.setTimeout(1_800_000);

  const runId = randomUUID();
  const prefix = `dload-${runId}`;
  const userIds = Array.from({ length: WALLETS }, (_, i) => `${prefix}-user-${i}`);
  const eventIds = Array.from({ length: WALLETS }, (_, i) => `${prefix}-evt-${i}`);
  const marketIds = Array.from({ length: WALLETS }, (_, i) => `${prefix}-mkt-${i}`);

  const walletRepo = new MongooseWalletRepository();
  const ledgerRepo = new MongooseLedgerRepository();
  const userRepo = new MongooseUserRepository();
  const betRepo = new MongooseBetRepository();
  const riskRepo = new MongooseRiskRepository();
  const eventRepo = new EventRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const riskService = new RiskService(riskRepo, betRepo);
  const betService = new BetService(betRepo, eventRepo, walletService, riskService, walletRepo);

  const originalMaxBetsPerWindow = RISK_CONFIG.MAX_BETS_PER_WINDOW;
  const totals = { deposits: 0, withdrawals: 0, bets: 0 };

  async function buildUserAndWallet(userId: string, idx: number): Promise<void> {
    const user = new User(
      userId,
      new Email(`${prefix}-${idx}@example.com`),
      `${prefix}-user-${idx}`,
      'Password123!',
      'ACTIVE',
      new Date(),
      new Date(),
    );
    await userRepo.save(user);
    await walletService.createWallet({ userId, currency: 'BRL' });
  }

  async function seedEvents(): Promise<void> {
    for (let i = 0; i < WALLETS; i += 1) {
      const event = new Event(
        eventIds[i],
        `Distributed Load Event ${i}`,
        new Date(Date.now() + 60 * 60 * 1000),
        'SCHEDULED',
        'Football',
        ['Team A', 'Team B'],
        new Map([
          [
            marketIds[i],
            new Market(
              marketIds[i],
              'Vencedor',
              'OPEN',
              new Map([['home', new Odds(ODDS_VALUE)]]),
            ),
          ],
        ]),
      );
      await eventRepo.create(event);
    }
  }

  async function runChains<T>(chains: Array<() => Promise<T>>, wave: number): Promise<unknown[]> {
    const rejected: unknown[] = [];
    for (let offset = 0; offset < chains.length; offset += wave) {
      const results = await Promise.allSettled(chains.slice(offset, offset + wave).map((fn) => fn()));
      for (const r of results) {
        if (r.status === 'rejected') rejected.push(r.reason);
      }
    }
    if (rejected.length > 0) {
      console.log(
        'DLOAD rejected reasons:',
        rejected.slice(0, 10).map((r) => ({
          name: (r as Error | undefined)?.name,
          message: (r as Error | undefined)?.message,
          code: (r as { code?: string } | undefined)?.code,
          statusCode: (r as { statusCode?: number } | undefined)?.statusCode,
        })),
      );
    }
    return rejected;
  }

  beforeAll(async () => {
    await connectMongoDB(getMongoDBConfig());
    RISK_CONFIG.MAX_BETS_PER_WINDOW = 100_000;
    await seedEvents();
    await runChains(
      userIds.map((userId, i) => () => buildUserAndWallet(userId, i)),
      WAVE,
    );
  }, 1_800_000);

  afterAll(async () => {
    if (runRealIntegration) {
      await Promise.all([
        UserModel.deleteMany({ _id: { $in: userIds } }),
        WalletModel.deleteMany({ userId: { $in: userIds } }),
        LedgerEntryModel.deleteMany({ userId: { $in: userIds } }),
        BetModel.deleteMany({ eventId: { $in: eventIds } }),
        RiskProfileModel.deleteMany({ userId: { $in: userIds } }),
        RiskExposureCounterModel.deleteMany({
          $or: [
            { scope: 'EVENT', refId: { $in: eventIds } },
            { scope: 'MARKET', refId: { $in: marketIds } },
          ],
        }),
      ]);
      RISK_CONFIG.MAX_BETS_PER_WINDOW = originalMaxBetsPerWindow;
      await disconnectMongoDB();
    }
  });

  it(`${WALLETS} carteiras distintas, ${DEPOSITS_PER_WALLET} depósitos sequenciais por carteira (${WALLETS * DEPOSITS_PER_WALLET} ops): sem perda, sem rejeição`, async () => {
    const wall = wallNow();
    const rejected = await runChains(
      userIds.map((userId) => async () => {
        for (let d = 0; d < DEPOSITS_PER_WALLET; d += 1) {
          await retryOnConflict(() => walletService.deposit(userId, DEPOSIT_AMOUNT));
        }
      }),
      WAVE,
    );
    const depositsMs = wall.mark();

    const expected = DEPOSITS_PER_WALLET * DEPOSIT_AMOUNT;
    for (const userId of userIds) {
      const wallet = await walletService.findByUserId(userId);
      expect(wallet?.balance).toBeCloseTo(expected, 6);
    }
    const ledgerDeposits = await LedgerEntryModel.countDocuments({
      userId: { $in: userIds },
      type: 'DEPOSIT',
    });
    expect(ledgerDeposits).toBe(WALLETS * DEPOSITS_PER_WALLET);
    expect(rejected.length).toBe(0);
    totals.deposits = rejected.length;

    console.log(
      `DLOAD deposits: ${WALLETS * DEPOSITS_PER_WALLET} ops, wallets: ${WALLETS}, fulfilled: ${WALLETS * DEPOSITS_PER_WALLET}, rejected: ${count(rejected)}, elapsed_ms: ${depositsMs}, ops_per_sec: ${((WALLETS * DEPOSITS_PER_WALLET * 1000) / depositsMs).toFixed(1)}`,
    );
  });

  it(`${WALLETS} carteiras distintas, ${WITHDRAWALS_PER_WALLET} saques cobertos por carteira (${WALLETS * WITHDRAWALS_PER_WALLET} ops): saldo exato, 0 rejeitados`, async () => {
    const wall = wallNow();
    const fundRejected = await runChains(
      userIds.map((userId) => () => retryOnConflict(() => walletService.deposit(userId, FUNDING))),
      WAVE,
    );
    const withdrawRejected = await runChains(
      userIds.map((userId) => async () => {
        for (let d = 0; d < WITHDRAWALS_PER_WALLET; d += 1) {
          await retryOnConflict(() => walletService.withdraw(userId, WITHDRAWAL_AMOUNT));
        }
      }),
      WAVE,
    );
    const withdrawalsMs = wall.mark();

    const expected =
      FUNDING + DEPOSITS_PER_WALLET * DEPOSIT_AMOUNT - WITHDRAWALS_PER_WALLET * WITHDRAWAL_AMOUNT;
    for (const userId of userIds) {
      const wallet = await walletService.findByUserId(userId);
      expect(wallet?.balance).toBeCloseTo(expected, 6);
      expect(wallet?.lockedBalance).toBe(0);
    }
    const ledgerWithdrawals = await LedgerEntryModel.countDocuments({
      userId: { $in: userIds },
      type: 'WITHDRAWAL_COMPLETED',
    });
    expect(ledgerWithdrawals).toBe(WALLETS * WITHDRAWALS_PER_WALLET);
    expect(fundRejected.length).toBe(0);
    expect(withdrawRejected.length).toBe(0);
    totals.withdrawals = fundRejected.length + withdrawRejected.length;

    console.log(
      `DLOAD withdrawals: ${WALLETS * WITHDRAWALS_PER_WALLET} ops, wallets: ${WALLETS}, fulfilled: ${WALLETS * WITHDRAWALS_PER_WALLET}, rejected: ${count([...fundRejected, ...withdrawRejected])}, elapsed_ms: ${withdrawalsMs}, ops_per_sec: ${((WALLETS * WITHDRAWALS_PER_WALLET * 1000) / withdrawalsMs).toFixed(1)}`,
    );
  });

  it(`${WALLETS} usuários × ${BETS_PER_USER} apostas em eventos próprios (${WALLETS * BETS_PER_USER} ops): sem perda nem duplicação`, async () => {
    const wall = wallNow();
    const rejected = await runChains(
      userIds.map((userId, i) => async () => {
        for (let b = 0; b < BETS_PER_USER; b += 1) {
          await retryOnConflict(() =>
            betService.placeBet({
              userId,
              eventId: eventIds[i],
              marketId: marketIds[i],
              oddId: 'home',
              amount: STAKE,
              type: 'SINGLE',
            }),
          );
        }
      }),
      WAVE,
    );
    const betsMs = wall.mark();

    const expectedBalance =
      FUNDING +
      DEPOSITS_PER_WALLET * DEPOSIT_AMOUNT -
      WITHDRAWALS_PER_WALLET * WITHDRAWAL_AMOUNT -
      STAKE * BETS_PER_USER;
    for (const userId of userIds) {
      const wallet = await walletService.findByUserId(userId);
      expect(wallet?.balance).toBeCloseTo(expectedBalance, 6);
    }
    const storedBets = await BetModel.countDocuments({ eventId: { $in: eventIds } });
    expect(storedBets).toBe(WALLETS * BETS_PER_USER);
    const ledgerDebits = await LedgerEntryModel.countDocuments({
      userId: { $in: userIds },
      type: 'BET_DEBIT',
    });
    expect(ledgerDebits).toBe(WALLETS * BETS_PER_USER);
    for (const userId of userIds) {
      const profile = await RiskProfileModel.findOne({ userId });
      expect(profile?.exposureCents).toBe(STAKE * BETS_PER_USER * 100);
    }
    for (const eventId of eventIds) {
      const counter = await RiskExposureCounterModel.findOne({ scope: 'EVENT', refId: eventId });
      expect(counter?.exposureCents).toBe(STAKE * BETS_PER_USER * 100);
    }
    for (const marketId of marketIds) {
      const counter = await RiskExposureCounterModel.findOne({ scope: 'MARKET', refId: marketId });
      expect(counter?.exposureCents).toBe(STAKE * BETS_PER_USER * 100);
    }
    expect(rejected.length).toBe(0);
    totals.bets = rejected.length;

    console.log(
      `DLOAD bets: ${WALLETS * BETS_PER_USER} ops, users: ${WALLETS}, fulfilled: ${WALLETS * BETS_PER_USER}, rejected: ${count(rejected)}, elapsed_ms: ${betsMs}, ops_per_sec: ${((WALLETS * BETS_PER_USER * 1000) / betsMs).toFixed(1)}`,
    );
  });

  afterAll(async () => {
    const totalOps = WALLETS * (DEPOSITS_PER_WALLET + WITHDRAWALS_PER_WALLET + BETS_PER_USER);
    console.log(`DLOAD rejected: ${totals.deposits + totals.withdrawals + totals.bets}`);
    console.log(`DLOAD total ops: ${totalOps}, scale: ${LOAD_SCALE}, wallets: ${WALLETS}, wave: ${WAVE}`);
  });
});