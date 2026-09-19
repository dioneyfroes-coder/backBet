import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MongoClient } from 'mongodb';
import { connectMongoDB, disconnectMongoDB, getMongoDBConfig } from '@/infrastructure/persistence/mongoose/config';
import { dbNameFromUri, getMongoUri } from '@/shared/config/connections';
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
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { BetService } from '@/core/betting/domain/services/BetService';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { FinancialReconciliationService } from '@/core/finance/application/services/FinancialReconciliationService';
import { EventRepository } from '@/core/betting/domain/repositories/EventRepository';
import { Event, Market } from '@/core/betting/domain/entities/Event';
import { Odds } from '@/core/odds/domain/value-objects/Odds';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';
import { FsBackupIO, createBackup, restoreBackup, validateBackup, validateRestored } from '@/infrastructure/backup/backupService';
import { MongoBackupDataSource } from '@/infrastructure/backup/mongoBackupDataSource';
import { FINANCE_COLLECTIONS, compareReconciliations, reconcileDbFinance } from '@/infrastructure/backup/financeReconciliation';

const runRealIntegration = process.env.RUN_REAL_INTEGRATION_TESTS === 'true';
const describeReal = runRealIntegration ? describe : describe.skip;

/**
 * Fase 15 — Backup e Disaster Recovery (MongoDB real).
 *
 * Objetivo:
 *   > backup ↓ checksum ↓ restore ↓ contagens ↓ reconciliAÇÃO financeira,
 *   > e o ambiente restaurado (users, wallets, ledger, bets, withdrawals)
 *   > reconcilia IDÊNTICO ao original.
 *
 * Cria dados financeiros reais pelos caminhos de domínio (depósito, aposta,
 * settlement, solicitação de saque aprovada), faz backup → valida checksum →
 * restaura num banco novo → confere contagens → roda o FinancialReconciliationService
 * (via raw Mongo) em AMBOS e compara: saldo == derivado do ledger nos dois.
 */
describeReal('Fase 15 — Backup/DR (MongoDB real)', () => {
  jest.setTimeout(300_000);
  const runId = randomUUID().slice(0, 8);
  const prefix = `backup-${runId}`;
  const drillDbName = 'backbet-test-drill';
  const sourceDbName = dbNameFromUri(getMongoUri()) || 'backbet-test';
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backbet-backup-drill-'));

  const walletRepo = new MongooseWalletRepository();
  const ledgerRepo = new MongooseLedgerRepository();
  const betRepo = new MongooseBetRepository();
  const userRepo = new MongooseUserRepository();
  const riskRepo = new MongooseRiskRepository();
  const wdRepo = new MongooseWithdrawalRequestRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const reconciler = new FinancialReconciliationService(walletRepo, ledgerRepo);

  const seededUserIds: string[] = [];
  const seededRequestIds: string[] = [];
  let rawClient: MongoClient | undefined;

  async function createFundedUser(userId: string, amount: number): Promise<void> {
    seededUserIds.push(userId);
    await userRepo.save(
      new User(userId, new Email(`${userId}@example.com`), userId, 'Password123!', 'ACTIVE', new Date(), new Date()),
    );
    await walletService.createWallet({ userId, currency: 'BRL' });
    await walletService.deposit(userId, amount);
  }

  async function seedEvent(eventId: string, marketId: string): Promise<EventRepository> {
    const eventRepo = new EventRepository();
    await eventRepo.create(
      new Event(
        eventId,
        `Backup Event ${eventId}`,
        new Date(Date.now() + 60 * 60 * 1000),
        'SCHEDULED',
        'Football',
        ['Team A', 'Team B'],
        new Map([[marketId, new Market(marketId, 'Vencedor', 'OPEN', new Map([['home', new Odds(2.0)]]))]]),
      ),
    );
    return eventRepo;
  }

  beforeAll(async () => {
    await connectMongoDB(getMongoDBConfig());
    rawClient = new MongoClient(getMongoUri());
    await rawClient.connect();
    // Banco de drill é descartável e de uso exclusivo do teste: garante
    // idempotência mesmo se uma execução anterior abortou no meio.
    await rawClient.db(drillDbName).dropDatabase().catch(() => undefined);

    const userA = `${prefix}-a`;
    const userB = `${prefix}-b`;
    const eventId = `${prefix}-evt`;
    const marketId = `${prefix}-mkt`;

    await createFundedUser(userA, 1000);

    const eventRepo = await seedEvent(eventId, marketId);
    const riskService = new RiskService(riskRepo, betRepo);
    const betService = new BetService(betRepo, eventRepo, walletService, riskService, walletRepo);
    const bet = await betService.placeBet({
      userId: userA,
      eventId,
      marketId,
      oddId: 'home',
      amount: 100,
      type: 'SINGLE',
    });
    await betService.resolveBet({ betId: bet.id, result: 'WON', marketResult: 'home' });

    await createFundedUser(userB, 1000);
    const wdService = new WithdrawalRequestService(wdRepo, walletService);
    const request = await wdService.createRequest(userB, 100, 'BRL', undefined);
    seededRequestIds.push(request.id);
    await wdService.processRequest(request.id, 'admin-backup', 'APPROVED');

    for (const userId of seededUserIds) {
      const result = await reconciler.reconcileUser(userId);
      expect(result.passed).toBe(true);
    }
  });

  afterAll(async () => {
    if (runRealIntegration) {
      await Promise.all([
        UserModel.deleteMany({ _id: { $in: seededUserIds } }),
        WalletModel.deleteMany({ userId: { $in: seededUserIds } }),
        LedgerEntryModel.deleteMany({ userId: { $in: seededUserIds } }),
        BetModel.deleteMany({ userId: { $in: seededUserIds } }),
        RiskProfileModel.deleteMany({ userId: { $in: seededUserIds } }),
        WithdrawalRequestModel.deleteMany({ requestId: { $in: seededRequestIds } }),
        RiskExposureCounterModel.deleteMany({
          $or: [{ scope: 'EVENT', refId: `${prefix}-evt` }, { scope: 'MARKET', refId: `${prefix}-mkt` }],
        }),
      ]);
    }
    try {
      await rawClient?.db(drillDbName).dropDatabase();
    } catch {
      // ignora se o banco do drill não existir
    }
    await rawClient?.close();
    fs.rmSync(backupDir, { recursive: true, force: true });
    await disconnectMongoDB();
  });

  it('backup ↓ checksum ↓ restore ↓ contagens ↓ reconciliação financeira == origem', async () => {
    const io = new FsBackupIO();
    const source = new MongoBackupDataSource(rawClient!);

    const manifest = await createBackup({ source, io, dbName: sourceDbName, backupDir });
    const scoped = [FINANCE_COLLECTIONS.users, FINANCE_COLLECTIONS.wallets, FINANCE_COLLECTIONS.ledgerEntries, FINANCE_COLLECTIONS.bets, FINANCE_COLLECTIONS.withdrawalRequests];
    expect(manifest.totalDocuments).toBeGreaterThan(0);
    for (const collection of scoped) {
      expect(manifest.collections.some((plan) => plan.name === collection)).toBe(true);
    }

    const integrity = await validateBackup(io, backupDir);
    expect(integrity.errors).toHaveLength(0);

    const restored = await restoreBackup({ source, io, backupDir, targetDbName: drillDbName, dropExisting: true });
    const restoredCollections = new Set(restored.collections.map((c) => c.name));
    for (const collection of scoped) {
      expect(restoredCollections.has(collection)).toBe(true);
    }

    const counts = await validateRestored(io, backupDir, drillDbName, source);
    expect(counts.mismatches).toHaveLength(0);

    const sourceSummary = await reconcileDbFinance(rawClient!.db(sourceDbName));
    const drillSummary = await reconcileDbFinance(rawClient!.db(drillDbName));
    expect(sourceSummary.results.length).toBeGreaterThanOrEqual(2);
    expect(drillSummary.results.length).toBe(sourceSummary.results.length);

    const finance = compareReconciliations(sourceSummary, drillSummary);
    expect(finance.diffs).toHaveLength(0);
    expect(finance.equal).toBe(true);
    expect(finance.sourcePassed).toBe(true);
    expect(finance.restoredPassed).toBe(true);
    expect(sourceSummary.failed).toBe(0);
    expect(drillSummary.failed).toBe(0);
  });
});