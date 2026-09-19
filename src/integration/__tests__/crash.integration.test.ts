import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
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
import { FinancialReconciliationService } from '@/core/finance/application/services/FinancialReconciliationService';
import { IdempotencyService } from '@/shared/services/IdempotencyService';
import type { IdempotencyStore } from '@/shared/services/IdempotencyService';
import { MongoIdempotencyStore } from '@/infrastructure/persistence/mongoose/stores/MongoIdempotencyStore';
import { processWithdrawalPayloadOnce } from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';
import { recoverWithdrawalProcessing } from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';
import type IPaymentPort from '@/core/finance/domain/ports/IPaymentPort';
import type { PaymentResult, WithdrawalStatus } from '@/core/finance/domain/ports/IPaymentPort';
import type { WithdrawalPayoutPayload } from '@/core/finance/domain/ports/IWithdrawalQueue';
import { Currency } from '@/core/finance/domain/value-objects/Currency';
import { AppError } from '@/shared/errors/AppError';
import { EventRepository } from '@/core/betting/domain/repositories/EventRepository';
import { Event, Market } from '@/core/betting/domain/entities/Event';
import { Odds } from '@/core/odds/domain/value-objects/Odds';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';
import { TransactionSession } from '@/core/shared/types/Transaction';
import type { WalletRepositoryOptions, IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import type { ITransactionDTO } from '@/core/finance/domain/entities/Transaction';

const runRealIntegration = process.env.RUN_REAL_INTEGRATION_TESTS === 'true';
const describeReal = runRealIntegration ? describe : describe.skip;

/**
 * Fase 14 — Crash testing (MongoDB real).
 *
 * Objetivo:
 *   > nenhuma interrupção do processo pode criar uma transação financeira
 *   > impossível de reconciliar.
 *
 * Simula a MORTE do processo (PROCESS_DEATH) nas janelas exatas:
 *   - durante a transação (rollback);
 *   - após o commit / antes da resposta (idempotência PROCESSING);
 *   - durante retry (reexecução converge, sem duplicação);
 *   - durante payout, após o sucesso do PSP e antes do débito (recuperação
 *     consulta o PSP; nunca re-paga);
 * e fecha com um SIGKILL REAL do processo-filho que executa o caminho real do
 * worker durante um payout (docker kill durante payout) — verificando o estado
 * do Mongo depois via FinancialReconciliationService (saldo == ledger).
 */

const PROCESS_DEATH = Object.assign(new Error('processo morto'), { code: 'PROCESS_KILLED' });

class KillableWalletRepository implements IWalletRepository {
  dieOnUpdate = false;

  constructor(private readonly inner: IWalletRepository) {}

  private maybeDie(): void {
    if (this.dieOnUpdate) {
      this.dieOnUpdate = false;
      throw PROCESS_DEATH;
    }
  }

  async findByUserId(userId: string, options?: WalletRepositoryOptions): Promise<Wallet | null> {
    return this.inner.findByUserId(userId, options);
  }

  async save(wallet: Wallet, options?: WalletRepositoryOptions): Promise<Wallet> {
    return this.inner.save(wallet, options);
  }

  async update(wallet: Wallet, options?: WalletRepositoryOptions): Promise<Wallet> {
    this.maybeDie();
    return this.inner.update(wallet, options);
  }

  async delete(userId: string): Promise<void> {
    return this.inner.delete(userId);
  }

  async getHistory(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ transactions: ITransactionDTO[]; total: number }> {
    return this.inner.getHistory(userId, limit, offset);
  }

  async withTransaction<T>(work: (session: TransactionSession) => Promise<T>): Promise<T> {
    return this.inner.withTransaction!(work);
  }
}

class RetryConflictWalletRepository implements IWalletRepository {
  conflicting = false;

  constructor(private readonly inner: IWalletRepository) {}

  async findByUserId(userId: string, options?: WalletRepositoryOptions): Promise<Wallet | null> {
    return this.inner.findByUserId(userId, options);
  }

  async save(wallet: Wallet, options?: WalletRepositoryOptions): Promise<Wallet> {
    return this.inner.save(wallet, options);
  }

  async update(wallet: Wallet, options?: WalletRepositoryOptions): Promise<Wallet> {
    if (this.conflicting) {
      this.conflicting = false;
      throw new AppError('CONFLICT', 'versão da carteira divergiu', 409);
    }
    return this.inner.update(wallet, options);
  }

  async delete(userId: string): Promise<void> {
    return this.inner.delete(userId);
  }

  async getHistory(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ transactions: ITransactionDTO[]; total: number }> {
    return this.inner.getHistory(userId, limit, offset);
  }

  async withTransaction<T>(work: (session: TransactionSession) => Promise<T>): Promise<T> {
    return this.inner.withTransaction!(work);
  }
}

class KillableIdempotencyStore implements IdempotencyStore {
  armed = true;

  constructor(private readonly inner: MongoIdempotencyStore) {}

  async get<T>(key: string) {
    return this.inner.get<T>(key);
  }

  async setIfAbsent<T>(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    return this.inner.setIfAbsent<T>(key, value as never, ttlSeconds);
  }

  async set<T>(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (this.armed) {
      // Morte ANTES de persistir o COMPLETED: o registro segue PROCESSING.
      throw PROCESS_DEATH;
    }
    return this.inner.set<T>(key, value as never, ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    if (this.armed) {
      // Morte também no caminho de rollback: PROCESSING sobrevive no Mongo.
      throw PROCESS_DEATH;
    }
    return this.inner.delete(key);
  }

  reclaimStaleProcessing<T>(key: string, olderThanMs: number) {
    return this.inner.reclaimStaleProcessing<T>(key, olderThanMs);
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

  getWithdrawalStatus?(): Promise<{ status: WithdrawalStatus }> {
    return Promise.resolve({ status: 'UNKNOWN' });
  }
}

class PspStatusAdapter implements IPaymentPort {
  constructor(private readonly status: WithdrawalStatus) {}

  async payWithdrawal(): Promise<PaymentResult> {
    throw new Error('não deve pagar durante recuperação');
  }

  getWithdrawalStatus(): Promise<{ status: WithdrawalStatus }> {
    return Promise.resolve({ status: this.status });
  }
}

describeReal('Fase 14 — Crash testing (MongoDB real)', () => {
  jest.setTimeout(300_000);

  const runId = randomUUID();
  const prefix = `crash-${runId}`;

  const walletRepo = new MongooseWalletRepository();
  const ledgerRepo = new MongooseLedgerRepository();
  const betRepo = new MongooseBetRepository();
  const userRepo = new MongooseUserRepository();
  const riskRepo = new MongooseRiskRepository();
  const wdRepo = new MongooseWithdrawalRequestRepository();
  const eventRepo = new EventRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const reconciler = new FinancialReconciliationService(walletRepo, ledgerRepo);
  const wdService = new WithdrawalRequestService(wdRepo, walletService);

  const allUserIds: string[] = [];
  const eventIds: string[] = [];
  const marketIds: string[] = [];
  const requestIds: string[] = [];
  const idempotencyKeys: string[] = [];

  async function expectReconciled(userId: string): Promise<void> {
    const result = await reconciler.reconcileUser(userId);
    expect(result.passed).toBe(true);
  }

  async function seedEvent(eventId: string, marketId: string): Promise<void> {
    eventIds.push(eventId);
    marketIds.push(marketId);
    await eventRepo.create(
      new Event(
        eventId,
        `Crash Event ${eventId}`,
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

  async function createApprovedRequest(
    userId: string,
    amount: number,
  ): Promise<{ payload: WithdrawalPayoutPayload }> {
    const request = await wdService.createRequest(userId, amount, 'BRL', undefined);
    requestIds.push(request.id);
    await wdService.processRequest(request.id, 'admin-crash', 'APPROVED');
    return {
      payload: {
        requestId: request.id,
        userId,
        amount,
        currency: 'BRL' as Currency,
      },
    };
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

  it('C1a — docker kill durante transação de DEPÓSITO: rollback total, nada órfão', async () => {
    const userId = `${prefix}-c1a-user`;
    await createFundedUser(userId, 100);

    const killable = new KillableWalletRepository(walletRepo);
    const service = new WalletService(killable, ledgerRepo);
    const before = await service.findByUserId(userId);

    killable.dieOnUpdate = true;
    await expect(service.deposit(userId, 50)).rejects.toMatchObject({ code: 'PROCESS_KILLED' });

    const wallet = await service.findByUserId(userId);
    expect(wallet!.balance).toBeCloseTo(100, 6);
    expect(await LedgerEntryModel.countDocuments({ userId })).toBe(1); // só o depósito inicial
    await expectReconciled(userId);

    // Sem processo morto: a operação ocorre normalmente e reconcilia.
    await service.deposit(userId, 50);
    expect((await service.findByUserId(userId))!.balance).toBeCloseTo(150, 6);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'DEPOSIT' })).toBe(2);
    await expectReconciled(userId);
  });

  it('C1b — docker kill durante transação de APOSTA: aposta inexistente, débito e exposição revertidos', async () => {
    const userId = `${prefix}-c1b-user`;
    const eventId = `${prefix}-c1b-evt`;
    const marketId = `${prefix}-c1b-mkt`;
    await createFundedUser(userId, 1000);
    await seedEvent(eventId, marketId);

    const killable = new KillableWalletRepository(walletRepo);
    const killableWalletService = new WalletService(killable, ledgerRepo);
    const riskService = new RiskService(riskRepo, betRepo);
    const crashBetService = new BetService(
      betRepo,
      eventRepo,
      killableWalletService,
      riskService,
      killable,
    );

    killable.dieOnUpdate = true;
    await expect(
      crashBetService.placeBet({ userId, eventId, marketId, oddId: 'home', amount: 100, type: 'SINGLE' }),
    ).rejects.toMatchObject({ code: 'PROCESS_KILLED' });

    const wallet = await walletService.findByUserId(userId);
    expect(wallet!.balance).toBeCloseTo(1000, 6);
    expect(await BetModel.countDocuments({ userId })).toBe(0);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'BET_DEBIT' })).toBe(0);
    expect(await RiskProfileModel.findOne({ userId })).toBeNull();
    await expectReconciled(userId);

    // Na tentativa seguinte o mesmo usuário aposta normalmente — estado são.
    const bet = await crashBetService.placeBet({
      userId,
      eventId,
      marketId,
      oddId: 'home',
      amount: 100,
      type: 'SINGLE',
    });
    expect(bet).toBeDefined();
    expect((await walletService.findByUserId(userId))!.balance).toBeCloseTo(900, 6);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'BET_DEBIT' })).toBe(1);
    await expectReconciled(userId);
  });

  it('C1c — docker kill durante transação de SAQUE: sem hold órfão e sem request pendente', async () => {
    const userId = `${prefix}-c1c-user`;
    await createFundedUser(userId, 1000);

    const killable = new KillableWalletRepository(walletRepo);
    const killableWalletService = new WalletService(killable, ledgerRepo);
    const crashWdService = new WithdrawalRequestService(wdRepo, killableWalletService);

    killable.dieOnUpdate = true;
    await expect(crashWdService.createRequest(userId, 100, 'BRL', undefined)).rejects.toMatchObject({
      code: 'PROCESS_KILLED',
    });

    const wallet = await walletService.findByUserId(userId);
    expect(wallet!.balance).toBeCloseTo(1000, 6);
    expect(wallet!.lockedBalance).toBeCloseTo(0, 6);
    expect(await WithdrawalRequestModel.countDocuments({ userId })).toBe(0);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'WITHDRAWAL_HOLD' })).toBe(0);
    await expectReconciled(userId);

    await crashWdService.createRequest(userId, 100, 'BRL', undefined);
    const after = await walletService.findByUserId(userId);
    expect(after!.lockedBalance).toBeCloseTo(100, 6);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'WITHDRAWAL_HOLD' })).toBe(1);
    await expectReconciled(userId);
  });

  it('C2 — docker kill após commit / antes da resposta: crédito aplicado, PROCESSING e recuperação não duplica', async () => {
    const userId = `${prefix}-c2-user`;
    await createFundedUser(userId, 100);
    const referenceId = `${prefix}-c2-ref`;

    const store = new KillableIdempotencyStore(new MongoIdempotencyStore());
    const idem = new IdempotencyService(store, 3600);
    const key = `${userId}:deposit:${referenceId}`;
    idempotencyKeys.push(`backbet:idempotency:${key}`);
    const fingerprint = JSON.stringify({ amount: 50 });
    const context = { type: 'DEPOSIT' as const, referenceId, source: 'PIX' };

    await expect(
      idem.execute(key, fingerprint, () => walletService.deposit(userId, 50, context)),
    ).rejects.toMatchObject({ code: 'PROCESS_KILLED' });

    // Commit aconteceu; a "resposta" (gravação do COMPLETED) morreu no caminho.
    expect((await walletService.findByUserId(userId))!.balance).toBeCloseTo(150, 6);
    const stale = await IdempotencyEntryModel.findOne({ key: `backbet:idempotency:${key}` });
    expect(stale?.status).toBe('PROCESSING');
    await expectReconciled(userId);

    // Reinício do processo: reclaim do PROCESSING stale + reexecução idempotente.
    store.armed = false;
    const recovered = await idem.execute(
      key,
      fingerprint,
      () => walletService.deposit(userId, 50, context),
      undefined,
      1,
    );
    expect(recovered).toBeDefined();
    expect((await walletService.findByUserId(userId))!.balance).toBeCloseTo(150, 6);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'DEPOSIT' })).toBe(2); // inicial + 1
    const done = await IdempotencyEntryModel.findOne({ key: `backbet:idempotency:${key}` });
    expect(done?.status).toBe('COMPLETED');
    await expectReconciled(userId);
  });

  it('C3 — docker kill durante retry: reexecução converge a exatamente 1 crédito', async () => {
    const userId = `${prefix}-c3-user`;
    await createFundedUser(userId, 100);

    const retryRepo = new RetryConflictWalletRepository(walletRepo);
    const service = new WalletService(retryRepo, ledgerRepo);
    const referenceId = `${prefix}-c3-ref`;
    const context = { type: 'DEPOSIT' as const, referenceId, source: 'SOLIDITY' };

    // Primeiro update dispara CONFLICT (simula retry pós-crash); retryTransient
    // reexecuta a unidade inteira e ela converge — nunca em dobro.
    retryRepo.conflicting = true;
    await service.deposit(userId, 100, context);

    expect((await service.findByUserId(userId))!.balance).toBeCloseTo(200, 6);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'DEPOSIT' })).toBe(2); // inicial + 1
    await expectReconciled(userId);
  });

  it('C4 — docker kill durante SETTLEMENT: prêmio creditado uma única vez e recuperável', async () => {
    const userId = `${prefix}-c4-user`;
    const eventId = `${prefix}-c4-evt`;
    const marketId = `${prefix}-c4-mkt`;
    await createFundedUser(userId, 1000);
    await seedEvent(eventId, marketId);

    const riskService = new RiskService(riskRepo, betRepo);
    const betService = new BetService(betRepo, eventRepo, walletService, riskService, walletRepo);
    const bet = await betService.placeBet({
      userId,
      eventId,
      marketId,
      oddId: 'home',
      amount: 100,
      type: 'SINGLE',
    });

    const store = new KillableIdempotencyStore(new MongoIdempotencyStore());
    const idem = new IdempotencyService(store, 3600);
    const key = `settle:${bet.id}`;
    idempotencyKeys.push(`backbet:idempotency:${key}`);
    const fingerprint = JSON.stringify({ result: 'WON', marketResult: 'home' });

    await expect(
      idem.execute(key, fingerprint, () =>
        betService.resolveBet({ betId: bet.id, result: 'WON', marketResult: 'home' }),
      ),
    ).rejects.toMatchObject({ code: 'PROCESS_KILLED' });

    expect((await walletService.findByUserId(userId))!.balance).toBeCloseTo(1100, 6);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'BET_WIN' })).toBe(1);
    expect((await BetModel.findOne({ _id: bet.id }))?.status).toBe('WON');
    await expectReconciled(userId);

    store.armed = false;
    const replay = await idem.execute(
      key,
      fingerprint,
      () => betService.resolveBet({ betId: bet.id, result: 'WON', marketResult: 'home' }),
      undefined,
      1,
    );
    expect(replay.status).toBe('WON');
    expect((await walletService.findByUserId(userId))!.balance).toBeCloseTo(1100, 6);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'BET_WIN' })).toBe(1);
    await expectReconciled(userId);
  });

  it('C5 — docker kill durante PAYOUT após sucesso do PSP: recuperação consulta o PSP e nunca re-paga', async () => {
    const userId = `${prefix}-c5-user`;
    await createFundedUser(userId, 1000);
    const { payload } = await createApprovedRequest(userId, 100);

    const killable = new KillableWalletRepository(walletRepo);
    const killableWalletService = new WalletService(killable, ledgerRepo);
    const crashWdService = new WithdrawalRequestService(wdRepo, killableWalletService);
    const adapter = new CountingPaymentAdapter();

    // PSP paga (1 tentativa) e o processo "morre" no débito (transação revertida).
    killable.dieOnUpdate = true;
    await processWithdrawalPayloadOnce(payload, adapter, crashWdService);

    expect(adapter.attempts).toBe(1);
    const stuck = await WithdrawalRequestModel.findOne({ requestId: payload.requestId });
    expect(stuck?.status).toBe('PROCESSING');
    const walletAfterKill = await walletService.findByUserId(userId);
    expect(walletAfterKill!.balance).toBeCloseTo(900, 6);
    expect(walletAfterKill!.lockedBalance).toBeCloseTo(100, 6);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'WITHDRAWAL_COMPLETED' })).toBe(0);
    await expectReconciled(userId);

    // Recuperação consulta o PSP (PAID) e completa o débito 1 única vez.
    const recovery = await recoverWithdrawalProcessing(payload, new PspStatusAdapter('PAID'), wdService);
    expect(recovery).toBe('paid');
    expect(adapter.attempts).toBe(1);

    const done = await WithdrawalRequestModel.findOne({ requestId: payload.requestId });
    expect(done?.status).toBe('COMPLETED');
    const walletAfter = await walletService.findByUserId(userId);
    expect(walletAfter!.balance).toBeCloseTo(900, 6);
    expect(walletAfter!.lockedBalance).toBeCloseTo(0, 6);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'WITHDRAWAL_COMPLETED' })).toBe(1);
    await expectReconciled(userId);
  });

  it('C7 — docker kill REAL (SIGKILL) do worker durante payout', async () => {
    const userId = `${prefix}-c7-user`;
    await createFundedUser(userId, 1000);
    const { payload } = await createApprovedRequest(userId, 100);

    const marker = path.join(os.tmpdir(), `backbet-crash-${payload.requestId}.marker`);
    fs.rmSync(marker, { force: true });

    let tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    if (!fs.existsSync(tsxBin)) {
      tsxBin = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
    }

    const child = spawn(
      process.execPath,
      [tsxBin, path.join('scripts', 'crash', 'payout-child.ts')],
      {
        env: {
          ...process.env,
          PAYOUT_REQUEST_ID: payload.requestId,
          PAYOUT_USER_ID: userId,
          PAYOUT_AMOUNT: String(payload.amount),
          PAYOUT_CURRENCY: 'BRL',
          PAYOUT_MARKER: marker,
          PAYOUT_BARRIER_MS: '60000',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      },
    );
    const childOut = { out: '', err: '' };
    child.stdout.on('data', (d) => {
      childOut.out += String(d);
    });
    child.stderr.on('data', (d) => {
      childOut.err += String(d);
    });

    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.on('close', (code, signal) => resolve({ code, signal }));
    });

    let markerData: { paid: boolean; attempts: number } | null = null;
    for (let i = 0; i < 60; i += 1) {
      if (fs.existsSync(marker)) {
        markerData = JSON.parse(fs.readFileSync(marker, 'utf8')) as { paid: boolean; attempts: number };
        break;
      }
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    expect(markerData?.paid).toBe(true);
    expect(markerData?.attempts).toBe(1);

    // O tsx roda o script num processo filho; SIGKILL no grupo (detached/pgid)
    // garante que o worker real morra, não apenas o driver.
    const pgid = child.pid;
    if (pgid) {
      try {
        process.kill(-pgid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
    const how = await exited;
    expect(how.signal === 'SIGKILL' || how.code === 137).toBe(true);

    // Estado do Mongo após o SIGKILL: request PROCESSING, PSP já pagou, débito NÃO
    // aconteceu, nada órfão. (A janela de kill é DENTRO do adaptador, antes do
    // completePayout — o filho pode ter morrido também entre o retorno do
    // adaptador e o completePayout; qualquer um dos dois é o mesmo cenário.)
    const stuck = await WithdrawalRequestModel.findOne({ requestId: payload.requestId });
    expect(stuck?.status).toBe('PROCESSING');
    const walletAfterKill = await walletService.findByUserId(userId);
    expect(walletAfterKill!.balance).toBeCloseTo(900, 6);
    expect(walletAfterKill!.lockedBalance).toBeCloseTo(100, 6);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'WITHDRAWAL_COMPLETED' })).toBe(0);
    await expectReconciled(userId);

    const recovery = await recoverWithdrawalProcessing(payload, new PspStatusAdapter('PAID'), wdService);
    expect(recovery).toBe('paid');

    const done = await WithdrawalRequestModel.findOne({ requestId: payload.requestId });
    expect(done?.status).toBe('COMPLETED');
    const walletAfter = await walletService.findByUserId(userId);
    expect(walletAfter!.balance).toBeCloseTo(900, 6);
    expect(walletAfter!.lockedBalance).toBeCloseTo(0, 6);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'WITHDRAWAL_COMPLETED' })).toBe(1);
    await expectReconciled(userId);
  });

  it('C6 — síntese: toda a suíte de crash reconcilia (nenhuma transação impossível de reconciliar)', async () => {
    const summary = await reconciler.reconcileUsers(allUserIds);
    const failed = summary.results.filter((r) => !r.passed);
    if (failed.length > 0) {
      console.error('Falhas de reconciliação:', JSON.stringify(failed, null, 2));
    }
    expect(failed).toHaveLength(0);
  });
});