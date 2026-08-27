import { LedgerEntry } from '../entities/LedgerEntry';
import { TransactionRunner, TransactionSession } from '@/core/shared/types/Transaction';

export type LedgerRepositoryOptions = { session?: TransactionSession };

export interface ILedgerRepository {
  append(entry: LedgerEntry, options?: LedgerRepositoryOptions): Promise<LedgerEntry>;
  findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<LedgerEntry[]>;
  countByUserId(userId: string): Promise<number>;
  withTransaction?<T>(work: (session: TransactionSession) => Promise<T>): Promise<T>;
}

export type { TransactionRunner };
