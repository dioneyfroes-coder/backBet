import { AppError } from '@/shared/errors/AppError';
import { IHouseTreasuryRepository } from '@/core/treasury/domain/repositories/IHouseTreasuryRepository';
import { HouseWallet } from '@/core/treasury/domain/entities/HouseWallet';
import { TreasuryLedgerEntry } from '@/core/treasury/domain/entities/TreasuryLedgerEntry';
import { HouseTreasuryModel, IHouseTreasuryDocument } from '../schemas/TreasurySchema';
import { HouseTreasuryRecord, TreasuryLedgerRecord } from '@/types/persistence';

type PersistedRecord = Omit<HouseTreasuryRecord, '_id'> & {
  _id: HouseTreasuryRecord['_id'] | { toString(): string };
};

export class MongooseHouseTreasuryRepository implements IHouseTreasuryRepository {
  async getById(walletId: string): Promise<HouseWallet | null> {
    try {
      const record = await HouseTreasuryModel.findOne({ walletId }).lean<PersistedRecord | null>();
      if (!record) {
        return null;
      }
      return this.mapToDomain(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao buscar tesouraria', 'INTERNAL_SERVER_ERROR', 500, { message });
    }
  }

  async save(wallet: HouseWallet): Promise<HouseWallet> {
    try {
      await HouseTreasuryModel.findOneAndUpdate({ walletId: wallet.id }, this.serialize(wallet), {
        upsert: true,
        new: true,
      });
      return wallet;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao salvar tesouraria', 'INTERNAL_SERVER_ERROR', 500, { message });
    }
  }

  async update(wallet: HouseWallet): Promise<HouseWallet> {
    try {
      const result = await HouseTreasuryModel.findOneAndUpdate(
        { walletId: wallet.id },
        this.serialize(wallet),
        { new: true },
      );
      if (!result) {
        throw new AppError('Tesouraria não encontrada', 'NOT_FOUND', 404);
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

  private serialize(wallet: HouseWallet): Partial<IHouseTreasuryDocument> {
    return {
      walletId: wallet.id,
      currency: wallet.currency,
      profitBalance: wallet.profitBalance,
      prizeReserveBalance: wallet.prizeReserveBalance,
      ledger: wallet.getLedgerEntries().map((entry) => {
        const dto = entry.toDTO();
        return {
          id: dto.id,
          type: dto.type,
          amount: dto.amount,
          currency: dto.currency,
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
      record.profitBalance,
      record.prizeReserveBalance,
      ledgerEntries,
    );
  }

  private mapLedgerEntry(entry: TreasuryLedgerRecord): TreasuryLedgerEntry {
    return new TreasuryLedgerEntry(
      entry.type,
      entry.amount,
      entry.currency as HouseWallet['currency'],
      entry.description ?? undefined,
      entry.metadata ?? undefined,
      entry.id,
      entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt),
    );
  }
}
