import { LedgerEntry, LedgerOperationType, LedgerStatus } from '../entities/LedgerEntry';
import { TransactionRunner, TransactionSession } from '@/core/shared/types/Transaction';

export type LedgerRepositoryOptions = { session?: TransactionSession };

export interface LedgerSumOptions {
  from?: Date;
  statuses?: LedgerStatus[];
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
  withTransaction?<T>(work: (session: TransactionSession) => Promise<T>): Promise<T>;
}

export type { TransactionRunner };
