import { IHouseTreasuryRepository } from './IHouseTreasuryRepository';
import { HouseWallet } from '../entities/HouseWallet';
import { AppError } from '@/shared/errors/AppError';
import { optimisticLockConflictCounter } from '@/infrastructure/observability/metrics';

export class HouseTreasuryRepository implements IHouseTreasuryRepository {
  private store = new Map<string, HouseWallet>();

  async getById(walletId: string): Promise<HouseWallet | null> {
    const wallet = this.store.get(walletId);
    return wallet ? this.clone(wallet) : null;
  }

  async save(wallet: HouseWallet): Promise<HouseWallet> {
    this.store.set(wallet.id, this.clone(wallet));
    return wallet;
  }

  async update(wallet: HouseWallet): Promise<HouseWallet> {
    const current = this.store.get(wallet.id);
    if (!current) {
      throw new AppError('Tesouraria não encontrada', 'NOT_FOUND', 404);
    }
    if (current.version !== wallet.version - 1) {
      optimisticLockConflictCounter.inc({ resource: 'house_treasury' });
      throw new AppError('CONFLICT', 'Conflito de concorrência ao atualizar tesouraria', 409, {
        walletId: wallet.id,
        expectedVersion: wallet.version - 1,
        currentVersion: current.version,
      });
    }
    this.store.set(wallet.id, this.clone(wallet));
    return wallet;
  }

  async withTransaction<T>(work: (session: unknown) => Promise<T>): Promise<T> {
    return work(undefined);
  }

  private clone(wallet: HouseWallet): HouseWallet {
    return new HouseWallet(
      wallet.id,
      wallet.currency,
      wallet.profitBalanceCents,
      wallet.prizeReserveBalanceCents,
      wallet.getLedgerEntries(),
      wallet.version,
    );
  }
}
