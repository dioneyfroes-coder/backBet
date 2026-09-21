import { LedgerOperationType } from './LedgerEntry';

export type TransactionMetadata = Record<string, unknown> | undefined;

/**
 * Visão de leitura do histórico financeiro de uma carteira. É derivada do
 * Ledger (append-only, coleção própria) — a Wallet não mantém mais um array de
 * transações embutido (item #7 do plano de correções).
 */
export interface ITransactionDTO {
  id: string;
  userId: string;
  type: LedgerOperationType;
  amount: number;
  currency: string;
  description: string | undefined;
  createdAt: Date;
  metadata?: TransactionMetadata;
}
