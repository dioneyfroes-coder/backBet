import { Wallet } from '../entities/Wallet';
import { IWalletRepository } from '../repositories/IWalletRepository';
import { ICreateWalletDTO } from '../../types/wallet.types';
import { CurrencyValueObject } from '../value-objects/Currency';

export class WalletService {
  constructor(private walletRepository: IWalletRepository) {}

  async createWallet(input: ICreateWalletDTO): Promise<Wallet> {
    const existingWallet = await this.walletRepository.findByUserId(input.userId);
    if (existingWallet) {
      throw new Error('Wallet already exists for user');
    }

    const currency = new CurrencyValueObject(input.currency as 'BRL' | 'USD' | 'EUR');
    const wallet = new Wallet(input.userId, currency.toString());
    await this.walletRepository.save(wallet);
    return wallet;
  }

  async deposit(userId: string, amount: number): Promise<Wallet> {
    const wallet = await this.walletRepository.findByUserId(userId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    wallet.deposit(amount);
    await this.walletRepository.update(wallet);
    return wallet;
  }

  async withdraw(userId: string, amount: number): Promise<Wallet> {
    const wallet = await this.walletRepository.findByUserId(userId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    wallet.withdraw(amount);
    await this.walletRepository.update(wallet);
    return wallet;
  }
}