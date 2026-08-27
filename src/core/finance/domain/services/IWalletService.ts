import { Wallet, TransactionContext } from '../entities/Wallet';
import { LedgerEntry } from '../entities/LedgerEntry';
import { WalletRepositoryOptions } from '../repositories/IWalletRepository';

export interface IWalletService {
  createWallet(input: { userId: string; currency: string }): Promise<Wallet>;
  findByUserId(userId: string, options?: WalletRepositoryOptions): Promise<Wallet | null>;
  getHistory(userId: string, limit?: number, offset?: number): Promise<unknown>;
  getLedgerHistory(userId: string, limit?: number, offset?: number): Promise<{ entries: LedgerEntry[]; total: number }>;
  deposit(userId: string, amount: number, context?: TransactionContext, options?: WalletRepositoryOptions): Promise<Wallet>;
  withdraw(userId: string, amount: number, context?: TransactionContext, options?: WalletRepositoryOptions): Promise<Wallet>;
  lock(userId: string, amount: number, context?: TransactionContext, options?: WalletRepositoryOptions): Promise<Wallet>;
  unlock(userId: string, amount: number, context?: TransactionContext, options?: WalletRepositoryOptions): Promise<Wallet>;
  withdrawLocked(userId: string, amount: number, context?: TransactionContext, options?: WalletRepositoryOptions): Promise<Wallet>;
}
