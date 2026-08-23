import { Wallet } from '../entities/Wallet';
import { WalletRepositoryOptions } from '../repositories/IWalletRepository';

export interface IWalletService {
  createWallet(input: { userId: string; currency: string }): Promise<Wallet>;
  findByUserId(userId: string, options?: WalletRepositoryOptions): Promise<Wallet | null>;
  deposit(userId: string, amount: number, context?: unknown, options?: WalletRepositoryOptions): Promise<Wallet>;
  withdraw(userId: string, amount: number, context?: unknown, options?: WalletRepositoryOptions): Promise<Wallet>;
  lock(userId: string, amount: number, options?: WalletRepositoryOptions): Promise<Wallet>;
  unlock(userId: string, amount: number, options?: WalletRepositoryOptions): Promise<Wallet>;
  withdrawLocked(userId: string, amount: number, options?: WalletRepositoryOptions): Promise<Wallet>;
}
