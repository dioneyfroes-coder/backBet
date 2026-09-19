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
 * Fase 14 — Crash testing real ("docker kill durante payout").
 *
 * Processo filho, executado via `tsx` pelo crash.integration.test.ts, que roda
 * o CAMINHO REAL do worker (processWithdrawalPayloadOnce) contra o MongoDB real:
 *   1. marca o withdrawal como PROCESSING;
 *   2. paga no PSP (adaptador de barreira): grava o arquivo de marco ("PAID"
 *      com o nº de tentativas) e em seguida dorme PAYOUT_BARRIER_MS — abrindo a
 *      janela exata entre o sucesso do PSP e o completePayout (débito);
 *   3. retorna sucesso e completa o payout (se não for morto a tempo).
 *
 * O teste mata o processo com SIGKILL durante o passo 2 e verifica o estado do
 * MongoDB depois (invariante de reconciliação), seguido de recuperação via
 * consulta ao PSP (recoverWithdrawalProcessing) sem nunca re-executar o
 * pagamento.
 */

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class BarrierPaymentAdapter implements IPaymentPort {
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
    fs.writeFileSync(this.marker, JSON.stringify({ paid: true, attempts: this.attempts }));
    await sleep(this.barrierMs);
    return { success: true, transactionId: `crash-tx-${this.attempts}` };
  }
}

async function main(): Promise<void> {
  const requestId = process.env.PAYOUT_REQUEST_ID ?? '';
  const userId = process.env.PAYOUT_USER_ID ?? '';
  const amount = Number(process.env.PAYOUT_AMOUNT ?? '0');
  const currency = (process.env.PAYOUT_CURRENCY ?? 'BRL') as Currency;
  const marker = process.env.PAYOUT_MARKER ?? '';
  const barrierMs = Number(process.env.PAYOUT_BARRIER_MS ?? 60_000);

  if (!requestId || !userId || !marker || amount <= 0) {
    process.stderr.write('[payout-child] env PAYOUT_* mal configurado\n');
    process.exit(2);
  }

  await connectMongoDB(getMongoDBConfig());

  const walletRepo = new MongooseWalletRepository();
  const ledgerRepo = new MongooseLedgerRepository();
  const wdRepo = new MongooseWithdrawalRequestRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const wdService = new WithdrawalRequestService(wdRepo, walletService);
  const payload: WithdrawalPayoutPayload = { requestId, userId, amount, currency };
  const adapter = new BarrierPaymentAdapter(marker, barrierMs);

  await processWithdrawalPayloadOnce(payload, adapter, wdService);
  await disconnectMongoDB();
  process.exit(0);
}

main().catch((error: unknown) => {
  process.stderr.write(`[payout-child] error ${String(error)}\n`);
  process.exit(1);
});