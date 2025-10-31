import { Wallet } from '../entities/Wallet';

export interface IWalletRepository {
  findByUserId(userId: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<void>;
  update(wallet: Wallet): Promise<void>;
  delete(userId: string): Promise<void>;
}