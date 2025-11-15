import { IWalletDTO } from '../../types/wallet.types';
import { Transaction } from './Transaction';
import { AppError } from '@/shared/errors/AppError';

export class Wallet {
  private _balance: number = 0;
  private _lockedBalance: number = 0;
  private _transactions: Transaction[] = [];

  constructor(
    private readonly _userId: string,
    private readonly _currency: string,
  ) {}

  get userId(): string {
    return this._userId;
  }

  get balance(): number {
    return this._balance;
  }

  get lockedBalance(): number {
    return this._lockedBalance;
  }

  get currency(): string {
    return this._currency;
  }

  deposit(amount: number): void {
    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Amount must be positive', 400);
    }
    this._balance += amount;
    // registrar transação de depósito
    try {
      const tx = new Transaction(crypto.randomUUID(), this._userId, 'deposit', amount, this._currency, undefined, new Date());
      this._transactions.unshift(tx);
    } catch (err) {
      // não bloquear operação principal por erro de logging
    }
  }

  withdraw(amount: number): void {
    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Amount must be positive', 400);
    }
    if (this._balance < amount) {
      throw new AppError('BAD_REQUEST', 'Insufficient funds', 400);
    }
    this._balance -= amount;
    // registrar transação de saque
    try {
      const tx = new Transaction(crypto.randomUUID(), this._userId, 'withdraw', amount, this._currency, undefined, new Date());
      this._transactions.unshift(tx);
    } catch (err) {
      // ignorar
    }
  }

  lock(amount: number): void {
    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Amount must be positive', 400);
    }
    if (this._balance < amount) {
      throw new AppError('BAD_REQUEST', 'Insufficient funds', 400);
    }
    this._balance -= amount;
    this._lockedBalance += amount;
  }

  unlock(amount: number): void {
    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Amount must be positive', 400);
    }
    if (this._lockedBalance < amount) {
      throw new AppError('BAD_REQUEST', 'Amount exceeds locked balance', 400);
    }
    this._lockedBalance -= amount;
    this._balance += amount;
  }

  toDTO(): IWalletDTO {
    return {
      userId: this._userId,
      balance: this._balance,
      lockedBalance: this._lockedBalance,
      currency: this._currency,
    };
  }

  getTransactions(): Transaction[] {
    return [...this._transactions];
  }
}
