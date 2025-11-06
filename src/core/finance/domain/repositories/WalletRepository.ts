// src/core/finance/repositories/WalletRepository.ts
import { IWalletRepository } from '../../domain/repositories/IWalletRepository';
import { Wallet } from '../../domain/entities/Wallet';

export class WalletRepository implements IWalletRepository {
private wallets: Wallet[] = [];

  async findByUserId(userId: string): Promise<Wallet | null> {
    return this.wallets.find((w) => w.userId === userId) || null;
  }

  async save(wallet: Wallet): Promise<Wallet> {
    this.wallets.push(wallet);
    return wallet;
  }

  async update(wallet: Wallet): Promise<Wallet> {
    const index = this.wallets.findIndex((w) => w.userId === wallet.userId);
    if (index >= 0) this.wallets[index] = wallet;
    return wallet;
  }

  async delete(userId: string): Promise<void> {
    this.wallets = this.wallets.filter((w) => w.userId !== userId);
  }
}
