import { TransactionContext, Wallet } from '../entities/Wallet';
import { IWalletRepository } from '../repositories/IWalletRepository';
import { ICreateWalletDTO } from '../../types/wallet.types';
import { Currency, CurrencyValueObject } from '../value-objects/Currency';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';

export class WalletService {
  constructor(private walletRepository: IWalletRepository) {}

  async createWallet(input: ICreateWalletDTO): Promise<Wallet> {
    const existingWallet = await this.walletRepository.findByUserId(input.userId);
    if (existingWallet) {
      throw new DomainError({
        code: 'WALLET_ALREADY_EXISTS',
        message: 'Wallet already exists for user',
        details: { userId: input.userId },
      });
    }

    const currency = new CurrencyValueObject((input.currency || 'BRL') as Currency);
    const wallet = new Wallet(input.userId, currency.toString());
    await this.walletRepository.save(wallet);
    return wallet;
  }

  async deposit(userId: string, amount: number, context?: TransactionContext): Promise<Wallet> {
    const wallet = await this.ensureWalletExists(userId);
    wallet.deposit(amount, context);
    await this.walletRepository.update(wallet);
    this.logWalletAction('deposit', wallet, amount, context);
    return wallet;
  }

  async findByUserId(userId: string): Promise<Wallet | null> {
    return this.walletRepository.findByUserId(userId);
  }

  async getHistory(userId: string, limit = 10, offset = 0) {
    return this.walletRepository.getHistory(userId, limit, offset);
  }

  async withdraw(userId: string, amount: number, context?: TransactionContext): Promise<Wallet> {
    const wallet = await this.ensureWalletExists(userId);
    wallet.withdraw(amount, context);
    await this.walletRepository.update(wallet);
    this.logWalletAction('withdraw', wallet, amount, context);
    return wallet;
  }

  async lock(userId: string, amount: number): Promise<Wallet> {
    const wallet = await this.ensureWalletExists(userId);
    wallet.lock(amount);
    await this.walletRepository.update(wallet);
    this.logWalletAction('lock', wallet, amount);
    return wallet;
  }

  async unlock(userId: string, amount: number): Promise<Wallet> {
    const wallet = await this.ensureWalletExists(userId);
    wallet.unlock(amount);
    await this.walletRepository.update(wallet);
    this.logWalletAction('unlock', wallet, amount);
    return wallet;
  }

  async withdrawLocked(userId: string, amount: number): Promise<Wallet> {
    const wallet = await this.ensureWalletExists(userId);
    wallet.withdrawLocked(amount);
    await this.walletRepository.update(wallet);
    this.logWalletAction('withdraw_locked', wallet, amount);
    return wallet;
  }

  private async ensureWalletExists(userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findByUserId(userId);
    if (!wallet) {
      throw new DomainError({
        code: 'WALLET_NOT_FOUND',
        message: 'Wallet not found',
        details: { userId },
      });
    }
    return wallet;
  }

  private logWalletAction(
    action: 'deposit' | 'withdraw' | 'lock' | 'unlock' | 'withdraw_locked',
    wallet: Wallet,
    amount: number,
    context?: TransactionContext,
  ) {
    writeStructuredLog({
      event: 'wallet_action',
      action,
      userId: wallet.userId,
      amount,
      currency: wallet.currency,
      balance: wallet.balance,
      lockedBalance: wallet.lockedBalance,
      description: context?.description,
      metadata: context?.metadata,
    });
  }
}
