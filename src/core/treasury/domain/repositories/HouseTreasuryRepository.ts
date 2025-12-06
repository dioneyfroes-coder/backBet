import { IHouseTreasuryRepository } from './IHouseTreasuryRepository';
import { HouseWallet } from '../entities/HouseWallet';

export class HouseTreasuryRepository implements IHouseTreasuryRepository {
  private store = new Map<string, HouseWallet>();

  async getById(walletId: string): Promise<HouseWallet | null> {
    return this.store.get(walletId) ?? null;
  }

  async save(wallet: HouseWallet): Promise<HouseWallet> {
    this.store.set(wallet.id, wallet);
    return wallet;
  }

  async update(wallet: HouseWallet): Promise<HouseWallet> {
    this.store.set(wallet.id, wallet);
    return wallet;
  }
}
