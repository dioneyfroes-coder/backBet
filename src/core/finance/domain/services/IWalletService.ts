import { Wallet } from '../entities/Wallet';

export interface IWalletService {
  createWallet(input: { userId: string; currency: string; }): Promise<Wallet>;
  findByUserId(userId: string): Promise<Wallet | null>;
  deposit(userId: string, amount: number): Promise<Wallet>;
  withdraw(userId: string, amount: number): Promise<Wallet>;
}