import { AppError } from '@/shared/errors/AppError';
import { IHouseTreasuryRepository } from '@/core/treasury/domain/repositories/IHouseTreasuryRepository';
import { TreasuryRepositoryOperationOptions } from '@/core/treasury/domain/repositories/IHouseTreasuryRepository';
import { HouseWallet } from '@/core/treasury/domain/entities/HouseWallet';
import { TreasuryLedgerEntry } from '@/core/treasury/domain/entities/TreasuryLedgerEntry';
import { HouseTreasuryModel, IHouseTreasuryDocument } from '../schemas/TreasurySchema';
import { HouseTreasuryRecord, TreasuryLedgerRecord } from '@/types/persistence';
import { optimisticLockConflictCounter } from '@/infrastructure/observability/metrics';

type PersistedRecord = Omit<HouseTreasuryRecord, '_id'> & {
  _id: HouseTreasuryRecord['_id'] | { toString(): string };
  version?: number;
};

export class MongooseHouseTreasuryRepository implements IHouseTreasuryRepository {
  async getById(walletId: string, options: TreasuryRepositoryOperationOptions = {}): Promise<HouseWallet | null> {
    try {
      const query = HouseTreasuryModel.findOne({ walletId });
      if (options.session) {
        query.session(options.session as never);
      }
      const record = await query.lean<PersistedRecord | null>();
      if (!record) {
        return null;
      }
      return this.mapToDomain(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao buscar tesouraria', 'INTERNAL_SERVER_ERROR', 500, { message });
    }
  }

  async save(wallet: HouseWallet, options: TreasuryRepositoryOperationOptions = {}): Promise<HouseWallet> {
    try {
      const query = HouseTreasuryModel.findOneAndUpdate({ walletId: wallet.id }, this.serialize(wallet), {
        upsert: true,
        new: true,
      });
      if (options.session) {
        query.session(options.session as never);
      }
      await query;
      return wallet;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao salvar tesouraria', 'INTERNAL_SERVER_ERROR', 500, { message });
    }
  }

  async update(wallet: HouseWallet, options: TreasuryRepositoryOperationOptions = {}): Promise<HouseWallet> {
    try {
      const query = HouseTreasuryModel.findOneAndUpdate(
        {
          walletId: wallet.id,
          $or: [
            { version: wallet.version - 1 },
            ...(wallet.version === 1 ? [{ version: { $exists: false } }] : []),
          ],
        },
        { ...this.serialize(wallet), version: wallet.version },
        { new: true },
      );
      if (options.session) {
        query.session(options.session as never);
      }
      const result = await query;
      if (!result) {
        const existing = await HouseTreasuryModel.exists({ walletId: wallet.id });
        if (!existing) {
          throw new AppError('Tesouraria não encontrada', 'NOT_FOUND', 404);
        }
        optimisticLockConflictCounter.inc({ resource: 'house_treasury' });
        throw new AppError('CONFLICT', 'Conflito de concorrência ao atualizar tesouraria', 409, {
          walletId: wallet.id,
          expectedVersion: wallet.version - 1,
        });
      }
      return wallet;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao atualizar tesouraria', 'INTERNAL_SERVER_ERROR', 500, { message });
    }
  }

  async withTransaction<T>(work: (session: unknown) => Promise<T>): Promise<T> {
    const session = await HouseTreasuryModel.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } finally {
      await session.endSession();
    }
  }

  private serialize(wallet: HouseWallet): Partial<IHouseTreasuryDocument> {
    return {
      walletId: wallet.id,
      version: wallet.version,
      currency: wallet.currency,
      profitBalanceCents: wallet.profitBalanceCents,
      prizeReserveBalanceCents: wallet.prizeReserveBalanceCents,
      ledger: wallet.getLedgerEntries().map((entry) => {
        const dto = entry.toDTO();
        return {
          id: dto.id,
          type: dto.type,
          direction: dto.direction,
          amountCents: dto.amountCents,
          currency: dto.currency,
          profitBalanceAfterCents: dto.profitBalanceAfterCents,
          prizeReserveBalanceAfterCents: dto.prizeReserveBalanceAfterCents,
          source: dto.source,
          referenceId: dto.referenceId,
          description: dto.description,
          metadata: dto.metadata ?? undefined,
          createdAt: new Date(dto.createdAt),
        };
      }),
      updatedAt: new Date(),
    };
  }

  private mapToDomain(record: PersistedRecord): HouseWallet {
    const ledgerEntries = (record.ledger ?? []).map((entry) => this.mapLedgerEntry(entry));
    return new HouseWallet(
      record.walletId,
      record.currency as HouseWallet['currency'],
      record.profitBalanceCents,
      record.prizeReserveBalanceCents,
      ledgerEntries,
      record.version ?? 1,
    );
  }

  private mapLedgerEntry(entry: TreasuryLedgerRecord): TreasuryLedgerEntry {
    return new TreasuryLedgerEntry({
      type: entry.type,
      amountCents: entry.amountCents,
      currency: entry.currency as HouseWallet['currency'],
      direction: entry.direction,
      profitBalanceAfterCents: entry.profitBalanceAfterCents,
      prizeReserveBalanceAfterCents: entry.prizeReserveBalanceAfterCents,
      source: entry.source ?? undefined,
      referenceId: entry.referenceId ?? undefined,
      description: entry.description ?? undefined,
      metadata: entry.metadata ?? undefined,
      id: entry.id,
      createdAt: entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt),
    });
  }
}
