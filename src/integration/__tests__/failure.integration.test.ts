import { randomUUID } from 'crypto';
import { connectMongoDB, disconnectMongoDB, getMongoDBConfig } from '@/infrastructure/persistence/mongoose/config';
import { MongooseWalletRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseWalletRepository';
import { MongooseLedgerRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseLedgerRepository';
import { MongooseBetRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseBetRepository';
import { MongooseRiskRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseRiskRepository';
import { MongooseUserRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseUserRepository';
import { MongooseWithdrawalRequestRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseWithdrawalRequestRepository';
import { WalletModel } from '@/infrastructure/persistence/mongoose/schemas/WalletSchema';
import { LedgerEntryModel } from '@/infrastructure/persistence/mongoose/schemas/LedgerEntrySchema';
import { BetModel } from '@/infrastructure/persistence/mongoose/schemas/BetSchema';
import { RiskProfileModel } from '@/infrastructure/persistence/mongoose/schemas/RiskProfileSchema';
import { RiskExposureCounterModel } from '@/infrastructure/persistence/mongoose/schemas/RiskExposureCounterSchema';
import { WithdrawalRequestModel } from '@/infrastructure/persistence/mongoose/schemas/WithdrawalRequestSchema';
import { UserModel } from '@/infrastructure/persistence/mongoose/schemas/UserSchema';
import { IdempotencyEntryModel } from '@/infrastructure/persistence/mongoose/schemas/IdempotencyEntrySchema';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { BetService } from '@/core/betting/domain/services/BetService';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import {
  IdempotencyService,
  InMemoryIdempotencyStore,
} from '@/shared/services/IdempotencyService';
import type { IdempotencyStore } from '@/shared/services/IdempotencyService';
import { MongoIdempotencyStore } from '@/infrastructure/persistence/mongoose/stores/MongoIdempotencyStore';
import { processWithdrawalPayloadOnce } from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';
import type IPaymentPort from '@/core/finance/domain/ports/IPaymentPort';
import type { PaymentResult } from '@/core/finance/domain/ports/IPaymentPort';
import { RISK_CONFIG } from '@/core/risk/config/risk-config';
import { EventRepository } from '@/core/betting/domain/repositories/EventRepository';
import { Event, Market } from '@/core/betting/domain/entities/Event';
import { Odds } from '@/core/odds/domain/value-objects/Odds';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';
import { UniqueId } from '@/core/shared/domain/value-objects/UniqueId';
import { BetFactory } from '@/core/betting/domain/factories/BetFactory';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';
import type { TransactionSession } from '@/core/shared/types/Transaction';
import type { WalletRepositoryOptions, IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import type { ITransactionDTO } from '@/core/finance/domain/entities/Transaction';
import { Currency } from '@/core/finance/domain/value-objects/Currency';

const runRealIntegration = process.env.RUN_REAL_INTEGRATION_TESTS === 'true';
const describeReal = runRealIntegration ? describe : describe.skip;

class InterruptibleWalletRepository implements IWalletRepository {
  interrupted = false;

  constructor(private readonly inner: IWalletRepository) {}

  private guard(): void {
    if (this.interrupted) {
      throw new AppError('Serviço indisponível', 'SERVICE_UNAVAILABLE', 503, {
        originalError: 'MongoNetworkError (simulado)',
      });
    }
  }

  async findByUserId(userId: string, options?: WalletRepositoryOptions): Promise<Wallet | null> {
    this.guard();
    return this.inner.findByUserId(userId, options);
  }

  async save(wallet: Wallet, options?: WalletRepositoryOptions): Promise<Wallet> {
    this.guard();
    return this.inner.save(wallet, options);
  }

  async update(wallet: Wallet, options?: WalletRepositoryOptions): Promise<Wallet> {
    this.guard();
    return this.inner.update(wallet, options);
  }

  async delete(userId: string): Promise<void> {
    this.guard();
    return this.inner.delete(userId);
  }

  async getHistory(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ transactions: ITransactionDTO[]; total: number }> {
    this.guard();
    return this.inner.getHistory(userId, limit, offset);
  }

  async withTransaction<T>(work: (session: TransactionSession) => Promise<T>): Promise<T> {
    this.guard();
    return this.inner.withTransaction!(work);
  }
}

class FaultingIdempotencyStore implements IdempotencyStore {
  down = false;

  constructor(private readonly inner: InMemoryIdempotencyStore) {}

  private guard(): void {
    if (this.down) {
      throw new AppError('Redis indisponível', 'SERVICE_UNAVAILABLE', 503, {
        originalError: 'ECONNREFUSED (simulado)',
      });
    }
  }

  async get<T>(key: string) {
    this.guard();
    return this.inner.get<T>(key);
  }

  async setIfAbsent<T>(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    this.guard();
    return this.inner.setIfAbsent<T>(key, value as never, ttlSeconds);
  }

  async set<T>(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.guard();
    return this.inner.set<T>(key, value as never, ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    this.guard();
    return this.inner.delete(key);
  }
}

class CountingPaymentAdapter implements IPaymentPort {
  attempts = 0;

  async payWithdrawal(
    _requestId: string,
    _userId: string,
    _amount: number,
    _currency: Currency,
  ): Promise<PaymentResult> {
    this.attempts += 1;
    return { success: true, transactionId: `mock-tx-${this.attempts}` };
  }
}

describeReal('Fase 22 — Testes de falha (MongoDB real)', () => {
  jest.setTimeout(300_000);

  const runId = randomUUID();
  const prefix = `sag-${runId}`;

  const walletRepo = new MongooseWalletRepository();
  const ledgerRepo = new MongooseLedgerRepository();
  const betRepo = new MongooseBetRepository();
  const userRepo = new MongooseUserRepository();
  const riskRepo = new MongooseRiskRepository();
  const wdRepo = new MongooseWithdrawalRequestRepository();
  const eventRepo = new EventRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const riskService = new RiskService(riskRepo, betRepo);
  const betService = new BetService(betRepo, eventRepo, walletService, riskService, walletRepo);
  const wdService = new WithdrawalRequestService(wdRepo, walletService);

  const allUserIds: string[] = [];
  const eventIds: string[] = [];
  const marketIds: string[] = [];
  const requestIds: string[] = [];
  const idempotencyKeys: string[] = [];

  async function seedEvent(eventId: string, marketId: string): Promise<void> {
    eventIds.push(eventId);
    marketIds.push(marketId);
    await eventRepo.create(
      new Event(
        eventId,
        `Failure Event ${eventId}`,
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
              new Map([['home', new Odds(2.0)]]),
            ),
          ],
        ]),
      ),
    );
  }

  async function createFundedUser(userId: string, amount: number): Promise<void> {
    allUserIds.push(userId);
    await userRepo.save(
      new User(
        userId,
        new Email(`${userId}@example.com`),
        userId,
        'Password123!',
        'ACTIVE',
        new Date(),
        new Date(),
      ),
    );
    await walletService.createWallet({ userId, currency: 'BRL' });
    await walletService.deposit(userId, amount);
  }

  beforeAll(async () => {
    await connectMongoDB(getMongoDBConfig());
  });

  afterAll(async () => {
    if (runRealIntegration) {
      await Promise.all([
        UserModel.deleteMany({ _id: { $in: allUserIds } }),
        WalletModel.deleteMany({ userId: { $in: allUserIds } }),
        LedgerEntryModel.deleteMany({ userId: { $in: allUserIds } }),
        BetModel.deleteMany({ userId: { $in: allUserIds } }),
        RiskProfileModel.deleteMany({ userId: { $in: allUserIds } }),
        RiskExposureCounterModel.deleteMany({
          $or: [
            { scope: 'EVENT', refId: { $in: eventIds } },
            { scope: 'MARKET', refId: { $in: marketIds } },
          ],
        }),
        WithdrawalRequestModel.deleteMany({ requestId: { $in: requestIds } }),
        IdempotencyEntryModel.deleteMany({ key: { $in: idempotencyKeys } }),
      ]);
      await disconnectMongoDB();
    }
  });

  it('T1 — Mongo cai: depósito não deixa estado parcial e o retry com a mesma referência credita exatamente 1 vez', async () => {
    const userId = `${prefix}-t1-user`;
    const referenceId = `${prefix}-t1-ref`;
    allUserIds.push(userId);

    const interrupted = new InterruptibleWalletRepository(new MongooseWalletRepository());
    const service = new WalletService(interrupted, ledgerRepo);
    await service.createWallet({ userId, currency: 'BRL' });

    const context = { type: 'DEPOSIT' as const, referenceId, source: 'PIX' };

    interrupted.interrupted = true;
    await expect(service.deposit(userId, 100, context)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });

    interrupted.interrupted = false;
    await service.deposit(userId, 100, context);
    await service.deposit(userId, 100, context);

    const wallet = await service.findByUserId(userId);
    expect(wallet!.balance).toBe(100);

    const entries = await LedgerEntryModel.countDocuments({ userId, type: 'DEPOSIT' });
    expect(entries).toBe(1);
  });

  it('T2 — Redis cai: IdempotencyService falha de forma fechada e, recuperado, executa 1 única vez', async () => {
    const store = new FaultingIdempotencyStore(new InMemoryIdempotencyStore());
    const service = new IdempotencyService(store, 60);
    let executions = 0;
    const operation = async () => {
      executions += 1;
      return { ok: true };
    };

    store.down = true;
    await expect(service.execute('failure-t2', 'fp', operation)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(executions).toBe(0);

    store.down = false;
    await service.execute('failure-t2', 'fp', operation);
    const replay = await service.execute('failure-t2', 'fp', operation);
    expect(executions).toBe(1);
    expect(replay).toEqual({ ok: true });
  });

  it('T3 — Provider/request demora ou resposta perdida: retry deposita credita 1 vez (idempotência por ledger)', async () => {
    const userId = `${prefix}-t3-user`;
    const referenceId = `${prefix}-t3-ref`;
    allUserIds.push(userId);
    await walletService.createWallet({ userId, currency: 'BRL' });

    const context = { type: 'DEPOSIT' as const, referenceId, source: 'PIX' };
    await walletService.deposit(userId, 100, context);
    await walletService.deposit(userId, 100, context);

    const wallet = await walletService.findByUserId(userId);
    expect(wallet!.balance).toBe(100);

    const entries = await LedgerEntryModel.countDocuments({ userId, type: 'DEPOSIT' });
    expect(entries).toBe(1);
  });

  it('T4 — Transação aborta no meio: débito, aposta e exposição são revertidos (rollback real)', async () => {
    const userId = `${prefix}-t4-user`;
    const betId = new UniqueId().value;
    const eventId = `${prefix}-t4-evt`;
    const marketId = `${prefix}-t4-mkt`;
    await createFundedUser(userId, 1000);
    await seedEvent(eventId, marketId);

    await expect(
      walletRepo.withTransaction(async (session) => {
        await walletService.withdraw(
          userId,
          100,
          { type: 'BET_DEBIT', referenceId: betId, source: 'BET' },
          { session: session as TransactionSession },
        );
        await betRepo.create(
          BetFactory.createPendingBet({
            userId,
            eventId,
            marketId,
            amount: 100,
            currency: 'BRL',
            odds: new Odds(2.0),
            type: 'SINGLE',
            betIdFactory: () => betId,
          }),
          { session: session as TransactionSession },
        );
        throw new DomainError({ code: 'RISK_LIMIT_EXCEEDED', message: 'abort forçado' });
      }),
    ).rejects.toMatchObject({ code: 'RISK_LIMIT_EXCEEDED' });

    const wallet = await walletService.findByUserId(userId);
    expect(wallet!.balance).toBe(1000);
    expect(await BetModel.exists({ _id: betId })).toBeFalsy();
    expect(await LedgerEntryModel.countDocuments({ userId })).toBe(1);
    expect(await RiskProfileModel.findOne({ userId })).toBeNull();
  });

  it('T4 — Corrida de exposição: de 3 apostas simultâneas no limite, exatamente 1 sobrevive com estado consistente', async () => {
    const userId = `${prefix}-t4-race`;
    const eventId = `${prefix}-t4-race-evt`;
    const marketId = `${prefix}-t4-race-mkt`;
    const originalMax = RISK_CONFIG.MAX_EXPOSURE_PER_USER;
    await createFundedUser(userId, 500);
    await seedEvent(eventId, marketId);

    try {
      RISK_CONFIG.MAX_EXPOSURE_PER_USER = 150;

      const attempts = Array.from({ length: 3 }, () =>
        Promise.resolve(
          betService.placeBet({
            userId,
            eventId,
            marketId,
            oddId: 'home',
            amount: 100,
            type: 'SINGLE',
          }),
        ),
      );
      const results = await Promise.allSettled(attempts);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r) =>
          r.status === 'rejected' &&
          (r as PromiseRejectedResult).reason &&
          (r as PromiseRejectedResult).reason.code === 'RISK_LIMIT_EXCEEDED',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);
    } finally {
      RISK_CONFIG.MAX_EXPOSURE_PER_USER = originalMax;
    }

    const wallet = await walletService.findByUserId(userId);
    expect(wallet!.balance).toBeCloseTo(400, 6);
    expect(await BetModel.countDocuments({ userId })).toBe(1);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'BET_DEBIT' })).toBe(1);
    const profile = await RiskProfileModel.findOne({ userId });
    expect(profile?.exposureCents).toBe(10_000);
  });

  it('T5 — Worker reinicia com entrega duplicada: payout 1 única vez, sem débito duplo nem saldo preso', async () => {
    const userId = `${prefix}-t5-user`;
    await createFundedUser(userId, 1000);

    const request = await wdService.createRequest(userId, 100, 'BRL', undefined);
    await wdService.processRequest(request.id, 'admin-f22', 'APPROVED');
    requestIds.push(request.id);

    const before = await walletService.findByUserId(userId);
    expect(before!.balance).toBe(900);
    expect(before!.lockedBalance).toBe(100);

    const adapter = new CountingPaymentAdapter();
    const store = new MongoIdempotencyStore();
    const idem = new IdempotencyService(store, 3600);
    const payload = { requestId: request.id, userId, amount: 100, currency: 'BRL' as Currency };
    const key = `withdrawal-payout:${request.id}`;
    idempotencyKeys.push(`backbet:idempotency:${key}`);
    const fingerprint = JSON.stringify(payload);

    await idem.execute(key, fingerprint, () =>
      processWithdrawalPayloadOnce(payload, adapter, wdService),
    );
    expect(adapter.attempts).toBe(1);

    await expect(
      idem.execute(key, fingerprint, () => processWithdrawalPayloadOnce(payload, adapter, wdService)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(adapter.attempts).toBe(1);

    const done = await wdRepo.findById(request.id);
    expect(done?.status).toBe('COMPLETED');

    const after = await walletService.findByUserId(userId);
    expect(after!.balance).toBe(900);
    expect(after!.lockedBalance).toBe(0);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'WITHDRAWAL_COMPLETED' })).toBe(1);
  });

  it('T6 — Resultado WON reentregue (resposta perdida): prêmio creditado 1 única vez', async () => {
    const userId = `${prefix}-t6-user`;
    const eventId = `${prefix}-t6-evt`;
    const marketId = `${prefix}-t6-mkt`;
    await createFundedUser(userId, 1000);
    await seedEvent(eventId, marketId);

    const bet = await betService.placeBet({
      userId,
      eventId,
      marketId,
      oddId: 'home',
      amount: 100,
      type: 'SINGLE',
    });

    const store = new MongoIdempotencyStore();
    const idem = new IdempotencyService(store, 3600);
    const key = `settle:${bet.id}`;
    idempotencyKeys.push(`backbet:idempotency:${key}`);
    const fingerprint = JSON.stringify({ result: 'WON', marketResult: 'home' });

    const first = await idem.execute(key, fingerprint, () =>
      betService.resolveBet({ betId: bet.id, result: 'WON', marketResult: 'home' }),
    );
    expect(first.status).toBe('WON');

    const replay = await idem.execute(key, fingerprint, () =>
      betService.resolveBet({ betId: bet.id, result: 'WON', marketResult: 'home' }),
    );
    expect(replay.status).toBe('WON');

    const wallet = await walletService.findByUserId(userId);
    expect(wallet!.balance).toBeCloseTo(1100, 6);

    expect(await BetModel.findOne({ _id: bet.id, status: 'WON' })).toBeTruthy();
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'BET_WIN' })).toBe(1);
  });
});