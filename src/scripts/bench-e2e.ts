#!/usr/bin/env tsx
// Driver de bench E2E (executado pelo scripts/run-pm2-bench.cjs via tsx).
//
// Percorre o fluxo real de saque sob os workers do PM2:
//   usuário -> carteira fundada (deposit) -> withdrawal request ->
//   APPROVED (admin) -> enqueuePayout -> worker(s) PM2 processam ->
//   requisição COMPLETED, carteira debitada e 1 lançamento
//   WITHDRAWAL_COMPLETED no ledger.
//
// A execução é limpa (remove usuário/carteira/ledger/requisição do Mongo ao
// final) e imprime OK + exit=0 em caso de sucesso.
import { randomUUID } from 'crypto';
import {
  connectMongoDB,
  disconnectMongoDB,
  getMongoDBConfig,
} from '@/infrastructure/persistence/mongoose/config';
import {
  createWalletRepository,
  createWithdrawalRequestRepository,
  createLedgerRepository,
} from '@/infrastructure/persistence/factory';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { createWithdrawalQueue } from '@/infrastructure/withdrawals/withdrawalQueueFactory';
import { MongooseUserRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseUserRepository';
import { UserModel } from '@/infrastructure/persistence/mongoose/schemas/UserSchema';
import { WalletModel } from '@/infrastructure/persistence/mongoose/schemas/WalletSchema';
import { LedgerEntryModel } from '@/infrastructure/persistence/mongoose/schemas/LedgerEntrySchema';
import { WithdrawalRequestModel } from '@/infrastructure/persistence/mongoose/schemas/WithdrawalRequestSchema';
import { IdempotencyEntryModel } from '@/infrastructure/persistence/mongoose/schemas/IdempotencyEntrySchema';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const runId = randomUUID();
  const userId = `pm2e2e-${runId}`;
  const requestIds: string[] = [];
  let exitCode = 1;

  try {
    await connectMongoDB(getMongoDBConfig());

    const walletRepo = await createWalletRepository();
    const wdRepo = await createWithdrawalRequestRepository();
    const ledgerRepo = await createLedgerRepository();

    const walletService = new WalletService(walletRepo, ledgerRepo);
    const wdService = new WithdrawalRequestService(wdRepo, walletService);

    await new MongooseUserRepository().save(
      new User(userId, new Email(`${userId}@example.com`), userId, 'Password123!', 'ACTIVE', new Date(), new Date()),
    );
    await walletService.createWallet({ userId, currency: 'BRL' });
    await walletService.deposit(userId, 1000);

    const request = await wdService.createRequest(userId, 200, 'BRL', undefined);
    requestIds.push(request.id);
    await wdService.processRequest(request.id, 'admin-bench-e2e', 'APPROVED');

    const queue = await createWithdrawalQueue();
    await queue.enqueuePayout({ requestId: request.id, userId, amount: 200, currency: 'BRL' });
    console.log(`[bench-e2e] payout enfileirado request=${request.id} uid=${userId}`);

    const deadline = Date.now() + 120_000;
    let status = 'MISSING';
    while (Date.now() < deadline) {
      const doc = await WithdrawalRequestModel.findOne({ requestId: request.id });
      status = doc?.status ?? 'MISSING';
      if (status === 'COMPLETED') break;
      await sleep(1500);
    }
    console.log(`[bench-e2e] status final=${status}`);
    if (status !== 'COMPLETED') {
      throw new Error(`e2e timeout: status=${status}`);
    }

    const wallet = await walletService.findByUserId(userId);
    if (!wallet) throw new Error('wallet não encontrada');
    if (Math.abs(wallet.balance - 800) > 0.001) {
      throw new Error(`balance inesperado: ${wallet.balance} (esperado 800)`);
    }
    const completed = await LedgerEntryModel.countDocuments({ userId, type: 'WITHDRAWAL_COMPLETED' });
    if (completed !== 1) {
      throw new Error(`WITHDRAWAL_COMPLETED count=${completed} (esperado 1)`);
    }

    console.log(
      `[bench-e2e] OK request=${request.id} status=COMPLETED balance=${wallet.balance} ledger=${completed}`,
    );
    exitCode = 0;
  } catch (err) {
    console.error('[bench-e2e] FALHA', err);
  } finally {
    try {
      await Promise.allSettled([
        UserModel.deleteMany({ _id: userId }),
        WalletModel.deleteMany({ userId }),
        LedgerEntryModel.deleteMany({ userId }),
        WithdrawalRequestModel.deleteMany({ requestId: { $in: requestIds } }),
        IdempotencyEntryModel.deleteMany({ key: { $in: [`withdrawal-process:${requestIds[0]}`] } }),
      ]);
    } catch (errCleanup) {
      console.warn('[bench-e2e] limpeza parcial falhou', errCleanup);
    }
    await disconnectMongoDB().catch(() => {});
    process.exit(exitCode);
  }
}

void main();