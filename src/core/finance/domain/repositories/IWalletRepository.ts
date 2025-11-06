import { Wallet } from '../entities/Wallet';

export interface IWalletRepository {
  findByUserId(userId: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<Wallet>;
  update(wallet: Wallet): Promise<Wallet>;
  delete(userId: string): Promise<void>;
}
