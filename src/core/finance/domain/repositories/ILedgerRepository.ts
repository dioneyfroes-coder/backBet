import { LedgerEntry, LedgerOperationType, LedgerStatus } from '../entities/LedgerEntry';
import { TransactionRunner, TransactionSession } from '@/core/shared/types/Transaction';

export type LedgerRepositoryOptions = { session?: TransactionSession };

export interface LedgerSumOptions {
  from?: Date;
  statuses?: LedgerStatus[];
}

export interface LedgerAggregateOptions {
  from?: Date;
  to?: Date;
  statuses?: LedgerStatus[];
  currency?: string;
}

export interface LedgerAggregateResult {
  amountCents: number;
  count: number;
}

export interface ILedgerRepository {
  append(entry: LedgerEntry, options?: LedgerRepositoryOptions): Promise<LedgerEntry>;
  exists(transactionId: string, options?: LedgerRepositoryOptions): Promise<boolean>;
  findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<LedgerEntry[]>;
  countByUserId(userId: string): Promise<number>;
  sumByTypes(
    userId: string,
    types: LedgerOperationType[],
    options?: LedgerSumOptions,
  ): Promise<{ amountCents: number; count: number }>;
  /**
   * Soma agregações de operações de todos os usuários no período (para
   * relatórios administrativos). `from` é inclusivo e `to` exclusivo.
   */
  aggregateByTypes(
    types: LedgerOperationType[],
    options?: LedgerAggregateOptions,
  ): Promise<LedgerAggregateResult>;
  withTransaction?<T>(work: (session: TransactionSession) => Promise<T>): Promise<T>;
}

export type { TransactionRunner };
