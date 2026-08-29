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
import { UniqueId } from '@/core/shared/domain/value-objects/UniqueId';

const runRealIntegration = process.env.RUN_REAL_INTEGRATION_TESTS === 'true';
const describeReal = runRealIntegration ? describe : describe.skip;

const MAX_RETRIES = 10_000;

const isConflict = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  (error as { code?: string }).code === 'CONFLICT';

const isInsufficientFunds = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  (error as { code?: string }).code === 'WALLET_INSUFFICIENT_FUNDS';

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

describeReal('Fase 21 — Teste de carga (MongoDB real)', () => {
  jest.setTimeout(600_000);

  const runId = randomUUID();
  const prefix = `load-${runId}`;
  const USERS = 100;
  const BETS_PER_USER = 5;
  const STAKE = 100;
  const FUNDING = 1000;
  const ODDS_VALUE = 2.0;
  const EVENT_COUNT = USERS / 2;

  const walletRepo = new MongooseWalletRepository();
  const ledgerRepo = new MongooseLedgerRepository();
  const userRepo = new MongooseUserRepository();
  const betRepo = new MongooseBetRepository();
  const riskRepo = new MongooseRiskRepository();
  const eventRepo = new EventRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const riskService = new RiskService(riskRepo, betRepo);
  const betService = new BetService(betRepo, eventRepo, walletService, riskService, walletRepo);

  const betUserIds: string[] = [];
  const depositUserId = `${prefix}-deposit-user`;
  const withdrawUserId = `${prefix}-withdraw-user`;
  const eventIds: string[] = [];
  const marketIds: string[] = [];

  const originalMaxBetsPerWindow = RISK_CONFIG.MAX_BETS_PER_WINDOW;

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
    for (let i = 0; i < EVENT_COUNT; i += 1) {
      const eventId = `${prefix}-evt-${i}`;
      const marketId = `${prefix}-mkt-${i}`;
      eventIds.push(eventId);
      marketIds.push(marketId);
      const event = new Event(
        eventId,
        `Load Event ${i}`,
        new Date(Date.now() + 60 * 60 * 1000),
        'SCHEDULED',
        'Football',
        ['Team A', 'Team B'],
        new Map([
          [
            marketId,
            new Market(
              marketId,
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

  beforeAll(async () => {
    await connectMongoDB(getMongoDBConfig());
    RISK_CONFIG.MAX_BETS_PER_WINDOW = 1000;
    await seedEvents();

    const userCreation = Array.from({ length: USERS }, (_, i) => {
      const userId = `${prefix}-user-${i}`;
      betUserIds.push(userId);
      return buildUserAndWallet(userId, i);
    });
    await Promise.all(userCreation);
  });

  afterAll(async () => {
    if (runRealIntegration) {
      await Promise.all([
        UserModel.deleteMany({ _id: { $in: [...betUserIds, depositUserId, withdrawUserId] } }),
        WalletModel.deleteMany({ userId: { $in: [...betUserIds, depositUserId, withdrawUserId] } }),
        LedgerEntryModel.deleteMany({ userId: { $in: [...betUserIds, depositUserId, withdrawUserId] } }),
        BetModel.deleteMany({ eventId: { $in: eventIds } }),
        RiskProfileModel.deleteMany({ userId: { $in: [...betUserIds, depositUserId, withdrawUserId] } }),
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

  it('100 usuários e carteiras criados simultaneamente', async () => {
    const count = await UserModel.countDocuments({ _id: { $in: betUserIds } });
    expect(count).toBe(USERS);
    const walletCount = await WalletModel.countDocuments({
      userId: { $in: [...betUserIds, depositUserId] },
    });
    expect(walletCount).toBe(USERS);
  });

  it('100 depósitos concorrentes de R$ 1,25 na MESMA carteira: exatamente R$ 125,00', async () => {
    const amount = 1.25;
    await walletService.createWallet({ userId: depositUserId, currency: 'BRL' });

    const observedDepositBalances: number[] = [];
    const depositOperations = Array.from({ length: 100 }, () =>
      retryOnConflict(async () => {
        const updated = await walletService.deposit(depositUserId, amount);
        observedDepositBalances.push(updated.balance);
        return updated;
      }),
    );
    const results = await Promise.allSettled(depositOperations);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(100);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);
    expect(observedDepositBalances.every((balance) => balance >= 0)).toBe(true);

    const wallet = await walletService.findByUserId(depositUserId);
    expect(wallet!.balance).toBeCloseTo(125, 6);

    const ledgerEntries = await LedgerEntryModel.countDocuments({
      userId: depositUserId,
      type: 'DEPOSIT',
    });
    expect(ledgerEntries).toBe(100);
  });

  it('100 saques concorrentes de R$ 2,00 partindo de R$ 100,00: 50 aprovados, 50 rejeitados, saldo R$ 0,00', async () => {
    const withdrawal = 2;
    await walletService.createWallet({ userId: withdrawUserId, currency: 'BRL' });
    await walletService.deposit(withdrawUserId, 100);

    const observedWithdrawBalances: number[] = [];
    const withdrawOperations = Array.from({ length: 100 }, () =>
      retryOnConflict(async () => {
        const updated = await walletService.withdraw(withdrawUserId, withdrawal);
        observedWithdrawBalances.push(updated.balance);
        return updated;
      }),
    );
    const results = await Promise.allSettled(withdrawOperations);

    const approved = results.filter((r) => r.status === 'fulfilled');
    const rejectedInsufficient = results.filter(
      (r) => r.status === 'rejected' && isInsufficientFunds((r as PromiseRejectedResult).reason),
    );
    expect(approved).toHaveLength(50);
    expect(rejectedInsufficient).toHaveLength(50);
    expect(observedWithdrawBalances.length).toBe(50);
    expect(observedWithdrawBalances.every((balance) => balance >= 0)).toBe(true);

    const wallet = await walletService.findByUserId(withdrawUserId);
    expect(wallet!.balance).toBe(0);
    expect(wallet!.lockedBalance).toBe(0);

    const ledgerEntries = await LedgerEntryModel.countDocuments({
      userId: withdrawUserId,
      type: 'WITHDRAWAL_COMPLETED',
    });
    expect(ledgerEntries).toBe(50);
  });

  it('500 apostas simultâneas: 100 usuários × 5 apostas de R$ 100,00 — nenhuma perda nem duplicação', async () => {
    const fundingOperations = betUserIds.map((userId) =>
      retryOnConflict(() => walletService.deposit(userId, FUNDING)),
    );
    const funding = await Promise.allSettled(fundingOperations);
    expect(funding.filter((r) => r.status === 'fulfilled')).toHaveLength(USERS);

    const betOperations: Array<() => Promise<unknown>> = [];
    for (let i = 0; i < USERS; i += 1) {
      const eventId = eventIds[Math.floor(i / (USERS / EVENT_COUNT))];
      for (let b = 0; b < BETS_PER_USER; b += 1) {
        const userId = betUserIds[i];
        betOperations.push(() =>
          betService.placeBet({
            userId,
            eventId,
            marketId: marketIds[Math.floor(i / (USERS / EVENT_COUNT))],
            oddId: 'home',
            amount: STAKE,
            type: 'SINGLE',
          }),
        );
      }
    }
    expect(betOperations).toHaveLength(USERS * BETS_PER_USER);

    const results = await Promise.allSettled(betOperations.map((op) => retryOnConflict(op)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(USERS * BETS_PER_USER);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);

    const storedBets = await BetModel.countDocuments({ eventId: { $in: eventIds } });
    expect(storedBets).toBe(USERS * BETS_PER_USER);

    const ledgerDebits = await LedgerEntryModel.countDocuments({
      userId: { $in: betUserIds },
      type: 'BET_DEBIT',
    });
    expect(ledgerDebits).toBe(USERS * BETS_PER_USER);

    for (const userId of betUserIds) {
      const wallet = await walletService.findByUserId(userId);
      expect(wallet!.balance).toBeCloseTo(FUNDING - STAKE * BETS_PER_USER, 6);
      const profile = await RiskProfileModel.findOne({ userId });
      expect(profile?.exposureCents).toBe(STAKE * BETS_PER_USER * 100);
    }

    for (const eventId of eventIds) {
      const counter = await RiskExposureCounterModel.findOne({ scope: 'EVENT', refId: eventId });
      expect(counter?.exposureCents).toBe(STAKE * 10 * 100);
    }
    for (const marketId of marketIds) {
      const counter = await RiskExposureCounterModel.findOne({ scope: 'MARKET', refId: marketId });
      expect(counter?.exposureCents).toBe(STAKE * 10 * 100);
    }
  });
});