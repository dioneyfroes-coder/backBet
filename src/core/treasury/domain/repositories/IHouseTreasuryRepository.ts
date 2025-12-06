import { HouseWallet } from '../entities/HouseWallet';

export interface IHouseTreasuryRepository {
  getById(walletId: string): Promise<HouseWallet | null>;
  save(wallet: HouseWallet): Promise<HouseWallet>;
  update(wallet: HouseWallet): Promise<HouseWallet>;
}
