import { LedgerEntry, LedgerOperationType } from '../entities/LedgerEntry';
import {
  ILedgerRepository,
  LedgerRepositoryOptions,
  LedgerSumOptions,
} from './ILedgerRepository';
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

  async sumByTypes(
    userId: string,
    types: LedgerOperationType[],
    options?: LedgerSumOptions,
  ): Promise<{ amountCents: number; count: number }> {
    const typeSet = new Set(types);
    const statusSet = options?.statuses ? new Set(options.statuses) : null;
    const from = options?.from ? options.from.getTime() : null;
    let amountCents = 0;
    let count = 0;
    for (const entry of this.entries) {
      if (entry.userId !== userId || !typeSet.has(entry.type)) continue;
      if (from !== null && entry.createdAt.getTime() < from) continue;
      if (statusSet && !statusSet.has(entry.status)) continue;
      amountCents += entry.amountCents;
      count += 1;
    }
    return { amountCents, count };
  }

  async exists(transactionId: string, _options?: LedgerRepositoryOptions): Promise<boolean> {
    return this.findIndex(transactionId) >= 0;
  }

  async withTransaction<T>(work: (session: TransactionSession) => Promise<T>): Promise<T> {
    return work({});
  }

  private findIndex(transactionId: string): number {
    return this.entries.findIndex((e) => e.transactionId === transactionId);
  }
}
