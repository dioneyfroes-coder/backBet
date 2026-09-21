import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { connectMongoDB, disconnectMongoDB, getMongoDBConfig } from '@/infrastructure/persistence/mongoose/config';
import { MongooseWalletRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseWalletRepository';
import { MongooseLedgerRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseLedgerRepository';
import { MongooseUserRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseUserRepository';
import { MongooseWithdrawalRequestRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseWithdrawalRequestRepository';
import { WalletModel } from '@/infrastructure/persistence/mongoose/schemas/WalletSchema';
import { LedgerEntryModel } from '@/infrastructure/persistence/mongoose/schemas/LedgerEntrySchema';
import { UserModel } from '@/infrastructure/persistence/mongoose/schemas/UserSchema';
import { WithdrawalRequestModel } from '@/infrastructure/persistence/mongoose/schemas/WithdrawalRequestSchema';
import { IdempotencyEntryModel } from '@/infrastructure/persistence/mongoose/schemas/IdempotencyEntrySchema';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { FinancialReconciliationService } from '@/core/finance/application/services/FinancialReconciliationService';
import { processWithdrawalPayloadOnce } from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';
import type { WithdrawalPayoutPayload } from '@/core/finance/domain/ports/IWithdrawalQueue';
import { Currency } from '@/core/finance/domain/value-objects/Currency';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';

const runRealIntegration = process.env.RUN_REAL_INTEGRATION_TESTS === 'true';
const describeReal = runRealIntegration ? describe : describe.skip;

/**
 * Fase 16 — Multi-worker testing real (MongoDB + Redis reais).
 *
 * Subir DOIS workers (processos Node reais, via tsx) disputando a MESMA operação:
 * o payout de um único withdrawal recém-aprovado. O claim APPROVED -> PROCESSING é
 * atômico (CAS de estado), então no máximo um worker vence o claim e toca o PSP;
 * o vencido retorna imediatamente, sem efeito financeiro. Validado:
 *   - claim: só um worker assume;
 *   - payout: exatamente 1 chamada ao PSP (marcador compartilhado);
 *   - ledger: exatamente 1 WITHDRAWAL_COMPLETED;
 *   - state transition: APPROVED -> PROCESSING -> COMPLETED;
 *   - idempotência: uma 3ª entrega (reenvio) não re-paga;
 *   - reconciliação financeira (wallet vs ledger) ao final.
 */
describeReal('Fase 16 — Multi-worker testing (MongoDB real)', () => {
  jest.setTimeout(120_000);

  const runId = randomUUID();
  const prefix = `mw-${runId}`;
  const userIds: string[] = [];
  const requestIds: string[] = [];
  const idempotencyKeys: string[] = [];

  const walletRepo = new MongooseWalletRepository();
  const ledgerRepo = new MongooseLedgerRepository();
  const wdRepo = new MongooseWithdrawalRequestRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const wdService = new WithdrawalRequestService(wdRepo, walletService);
  const reconciler = new FinancialReconciliationService(walletRepo, ledgerRepo);

  beforeAll(async () => {
    await connectMongoDB(getMongoDBConfig());
  });

  afterAll(async () => {
    if (runRealIntegration) {
      await Promise.all([
        UserModel.deleteMany({ _id: { $in: userIds } }),
        WalletModel.deleteMany({ userId: { $in: userIds } }),
        LedgerEntryModel.deleteMany({ userId: { $in: userIds } }),
        WithdrawalRequestModel.deleteMany({ requestId: { $in: requestIds } }),
        IdempotencyEntryModel.deleteMany({ key: { $in: idempotencyKeys } }),
      ]);
      await disconnectMongoDB();
    }
  });

  async function createFundedUser(userId: string, amount: number): Promise<void> {
    userIds.push(userId);
    await new MongooseUserRepository().save(
      new User(userId, new Email(`${userId}@example.com`), userId, 'Password123!', 'ACTIVE', new Date(), new Date()),
    );
    await walletService.createWallet({ userId, currency: 'BRL' });
    await walletService.deposit(userId, amount);
  }

  async function createApprovedRequest(userId: string, amount: number): Promise<WithdrawalPayoutPayload> {
    const request = await wdService.createRequest(userId, amount, 'BRL', undefined);
    requestIds.push(request.id);
    await wdService.processRequest(request.id, 'admin-multiworker', 'APPROVED');
    return { requestId: request.id, userId, amount, currency: 'BRL' as Currency };
  }

  function spawnRacer(env: Record<string, string>): Promise<{ code: number | null; out: string; err: string }> {
    let tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    if (!fs.existsSync(tsxBin)) {
      tsxBin = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
    }
    const child = spawn(
      process.execPath,
      [tsxBin, path.join('scripts', 'multiworker', 'payout-racer-child.ts')],
      {
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const collected = { out: '', err: '' };
    child.stdout.on('data', (d) => { collected.out += String(d); });
    child.stderr.on('data', (d) => { collected.err += String(d); });
    return new Promise((resolve) => {
      child.on('close', (code) => resolve({ code, ...collected }));
    });
  }

  it('dois workers disputam o mesmo payout: 1 claim, 1 chamada ao PSP, 1 débito no ledger', async () => {
    const userId = `${prefix}-user`;
    await createFundedUser(userId, 1000);
    const payload = await createApprovedRequest(userId, 100);

    const marker = path.join(os.tmpdir(), `backbet-mw-${payload.requestId}.marker`);
    fs.rmSync(marker, { force: true });

    const baseEnv = {
      PAYOUT_REQUEST_ID: payload.requestId,
      PAYOUT_USER_ID: userId,
      PAYOUT_AMOUNT: String(payload.amount),
      PAYOUT_CURRENCY: 'BRL',
      PAYOUT_MARKER: marker,
      PAYOUT_BARRIER_MS: '400',
    };

    const [a, b] = await Promise.all([spawnRacer(baseEnv), spawnRacer(baseEnv)]);
    expect({ code: a.code, err: a.err }).toMatchObject({ code: 0 });
    expect({ code: b.code, err: b.err }).toMatchObject({ code: 0 });

    const attempts = fs
      .readFileSync(marker, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0);
    expect(attempts).toHaveLength(1);

    const done = await WithdrawalRequestModel.findOne({ requestId: payload.requestId });
    expect(done?.status).toBe('COMPLETED');

    const wallet = await walletService.findByUserId(userId);
    expect(wallet!.balance).toBeCloseTo(900, 6);
    expect(wallet!.lockedBalance).toBeCloseTo(0, 6);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'WITHDRAWAL_COMPLETED' })).toBe(1);

    const reconciled = await reconciler.reconcileUser(userId);
    expect(reconciled.passed).toBe(true);

    // Uma 3ª entrega (reenvio de job) também não re-paga nem altera o ledger.
    await processWithdrawalPayloadOnce(payload, {
      payWithdrawal: async () => {
        attempts.push('DUPLICATE');
        return { success: true, transactionId: 'should-not-happen' };
      },
    }, wdService);
    expect(attempts).toHaveLength(1);
    expect(await LedgerEntryModel.countDocuments({ userId, type: 'WITHDRAWAL_COMPLETED' })).toBe(1);

    idempotencyKeys.push(`withdrawal-process:${payload.requestId}`);
    idempotencyKeys.push(`withdrawal-recover-paid:${payload.requestId}`);
    idempotencyKeys.push(`withdrawal-recover-failed:${payload.requestId}`);
  });
});