import { Wallet } from '../entities/Wallet';
import { TransactionRunner, TransactionSession } from '@/core/shared/types/Transaction';

export type WalletRepositoryOptions = { session?: TransactionSession };

export interface IWalletRepository {
  findByUserId(userId: string, options?: WalletRepositoryOptions): Promise<Wallet | null>;
  save(wallet: Wallet, options?: WalletRepositoryOptions): Promise<Wallet>;
  update(wallet: Wallet, options?: WalletRepositoryOptions): Promise<Wallet>;
  delete(userId: string): Promise<void>;
  withTransaction?<T>(work: (session: TransactionSession) => Promise<T>): Promise<T>;
}
