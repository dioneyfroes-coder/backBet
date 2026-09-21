import fs from 'fs';
import { connectMongoDB, disconnectMongoDB, getMongoDBConfig } from '@/infrastructure/persistence/mongoose/config';
import { MongooseWalletRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseWalletRepository';
import { MongooseLedgerRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseLedgerRepository';
import { MongooseWithdrawalRequestRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseWithdrawalRequestRepository';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { processWithdrawalPayloadOnce } from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';
import type IPaymentPort from '@/core/finance/domain/ports/IPaymentPort';
import type { PaymentResult } from '@/core/finance/domain/ports/IPaymentPort';
import type { WithdrawalPayoutPayload } from '@/core/finance/domain/ports/IWithdrawalQueue';
import type { Currency } from '@/core/finance/domain/value-objects/Currency';

/**
 * Fase 16 — Multi-worker testing real ("dois workers disputam o mesmo payout").
 *
 * Processo filho, executado via `tsx` pelo multi-worker.integration.test.ts, que
 * roda o CAMINHO REAL do worker (processWithdrawalPayloadOnce) contra o MongoDB e
 * o Redis reais. Dois destes processos são disparados ao mesmo tempo sobre o MESMO
 * payload (mesma operação): o claim APPROVED/FAILED -> PROCESSING é atômico, então
 * no máximo um vence e toca o PSP; o vencido retorna sem efeito financeiro.
 *
 * Cada tentativa de pagamento no adaptador é registrada (append atômico) no arquivo
 * de marco PAYOUT_MARKER, e o vencedor dorme PAYOUT_BARRIER_MS depois do sucesso do
 * PSP para alargar a janela de sobreposição com o perdedor.
 */

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class RacerPaymentAdapter implements IPaymentPort {
  attempts = 0;

  constructor(
    private readonly marker: string,
    private readonly barrierMs: number,
  ) {}

  async payWithdrawal(
    _requestId: string,
    _userId: string,
    _amount: number,
    _currency: Currency,
  ): Promise<PaymentResult> {
    this.attempts += 1;
    fs.appendFileSync(this.marker, `${Date.now()} ${this.attempts}\n`);
    await sleep(this.barrierMs);
    return { success: true, transactionId: `racer-tx-${this.attempts}` };
  }
}

async function main(): Promise<void> {
  const requestId = process.env.PAYOUT_REQUEST_ID ?? '';
  const userId = process.env.PAYOUT_USER_ID ?? '';
  const amount = Number(process.env.PAYOUT_AMOUNT ?? '0');
  const currency = (process.env.PAYOUT_CURRENCY ?? 'BRL') as Currency;
  const marker = process.env.PAYOUT_MARKER ?? '';
  const barrierMs = Number(process.env.PAYOUT_BARRIER_MS ?? 500);

  if (!requestId || !userId || !marker || amount <= 0) {
    process.stderr.write('[racer] env PAYOUT_* mal configurado\n');
    process.exit(2);
  }

  await connectMongoDB(getMongoDBConfig());

  const walletRepo = new MongooseWalletRepository();
  const ledgerRepo = new MongooseLedgerRepository();
  const wdRepo = new MongooseWithdrawalRequestRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const wdService = new WithdrawalRequestService(wdRepo, walletService);
  const payload: WithdrawalPayoutPayload = { requestId, userId, amount, currency };
  const adapter = new RacerPaymentAdapter(marker, barrierMs);

  await processWithdrawalPayloadOnce(payload, adapter, wdService);
  process.stdout.write(`[racer] done attempts=${adapter.attempts}\n`);
  await disconnectMongoDB();
  process.exit(0);
}

main().catch((error: unknown) => {
  process.stderr.write(`[racer] error ${String(error)}\n`);
  process.exit(1);
});