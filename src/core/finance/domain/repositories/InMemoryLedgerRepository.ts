import { LedgerEntry } from '../entities/LedgerEntry';
import { ILedgerRepository, LedgerRepositoryOptions } from './ILedgerRepository';
import { TransactionSession } from '@/core/shared/types/Transaction';

export class InMemoryLedgerRepository implements ILedgerRepository {
  private entries: LedgerEntry[] = [];

  async append(entry: LedgerEntry, _options?: LedgerRepositoryOptions): Promise<LedgerEntry> {
    const existing = this.findIndex(entry.transactionId);
    if (existing >= 0) {
      this.entries[existing] = entry;
    } else {
      this.entries.unshift(entry);
    }
    return entry;
  }

  async findByUserId(
    userId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<LedgerEntry[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    return this.entries.filter((e) => e.userId === userId).slice(offset, offset + limit);
  }

  async countByUserId(userId: string): Promise<number> {
    return this.entries.filter((e) => e.userId === userId).length;
  }

  async withTransaction<T>(work: (session: TransactionSession) => Promise<T>): Promise<T> {
    return work({});
  }

  private findIndex(transactionId: string): number {
    return this.entries.findIndex((e) => e.transactionId === transactionId);
  }
}
