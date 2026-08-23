import { HouseWallet } from '../entities/HouseWallet';

export type TreasuryRepositoryOperationOptions = {
  session?: unknown;
};

export interface IHouseTreasuryRepository {
  getById(walletId: string, options?: TreasuryRepositoryOperationOptions): Promise<HouseWallet | null>;
  save(wallet: HouseWallet, options?: TreasuryRepositoryOperationOptions): Promise<HouseWallet>;
  update(wallet: HouseWallet, options?: TreasuryRepositoryOperationOptions): Promise<HouseWallet>;
  withTransaction<T>(work: (session: unknown) => Promise<T>): Promise<T>;
}
