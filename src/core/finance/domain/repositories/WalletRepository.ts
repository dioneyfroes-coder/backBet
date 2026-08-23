// src/core/finance/repositories/WalletRepository.ts
import { IWalletRepository } from '../../domain/repositories/IWalletRepository';
import { Wallet } from '../../domain/entities/Wallet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Transaction } from '../../domain/entities/Transaction';
import { AppError } from '@/shared/errors/AppError';

export class WalletRepository implements IWalletRepository {
  private wallets: Wallet[] = [];

  async findByUserId(userId: string): Promise<Wallet | null> {
    const wallet = this.wallets.find((w) => w.userId === userId);
    return wallet ? this.clone(wallet) : null;
  }

  async save(wallet: Wallet): Promise<Wallet> {
    this.wallets.push(this.clone(wallet));
    return wallet;
  }

  async update(wallet: Wallet): Promise<Wallet> {
    const index = this.wallets.findIndex((w) => w.userId === wallet.userId);
    if (index < 0) {
      return wallet;
    }
    const current = this.wallets[index];
    if (current.version !== wallet.version - 1) {
      throw new AppError('CONFLICT', 'Conflito de concorrência ao atualizar carteira', 409, {
        userId: wallet.userId,
        expectedVersion: wallet.version - 1,
        currentVersion: current.version,
      });
    }
    this.wallets[index] = this.clone(wallet);
    return wallet;
  }

  async delete(userId: string): Promise<void> {
    this.wallets = this.wallets.filter((w) => w.userId !== userId);
  }

  async getHistory(
    userId: string,
    limit = 10,
    offset = 0,
  ): Promise<{ transactions: import('../entities/Transaction').ITransactionDTO[]; total: number }> {
    const wallet = this.wallets.find((w) => w.userId === userId) || null;
    if (!wallet) return { transactions: [], total: 0 };
    const all = wallet.getTransactions();
    const total = all.length;
    const slice = all.slice(offset, offset + limit).map((t) => t.toDTO());
    return { transactions: slice, total };
  }

  private clone(wallet: Wallet): Wallet {
    const cloned = new Wallet(wallet.userId, wallet.currency, wallet.version);
    const internals = cloned as unknown as {
      _balance: Money;
      _lockedBalance: Money;
      _transactions: Transaction[];
    };
    internals._balance = new Money(wallet.balance, wallet.currency);
    internals._lockedBalance = new Money(wallet.lockedBalance, wallet.currency);
    internals._transactions = wallet.getTransactions();
    return cloned;
  }
}
