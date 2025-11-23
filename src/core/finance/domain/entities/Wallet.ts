import { randomUUID } from 'crypto';
import { IWalletDTO } from '../../types/wallet.types';
import { Transaction, TransactionType } from './Transaction';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Currency, CurrencyValueObject } from '../value-objects/Currency';

export class Wallet {
  private _balance: Money;
  private _lockedBalance: Money;
  private _transactions: Transaction[] = [];

  constructor(
    private readonly _userId: string,
    currency: Currency,
  ) {
    const validatedCurrency = new CurrencyValueObject(currency).toString();
    this._balance = new Money(0, validatedCurrency);
    this._lockedBalance = new Money(0, validatedCurrency);
  }

  get userId(): string {
    return this._userId;
  }

  get balance(): number {
    return this._balance.amount;
  }

  get lockedBalance(): number {
    return this._lockedBalance.amount;
  }

  get currency(): Currency {
    return this._balance.currency;
  }

  deposit(amount: number, description?: string): void {
    this.ensurePositiveAmount(amount);
    const money = this.createMoney(amount);
    this._balance = this._balance.add(money);
    this.recordTransaction('deposit', money.amount, description);
  }

  withdraw(amount: number, description?: string): void {
    this.ensurePositiveAmount(amount);
    const money = this.createMoney(amount);
    if (this._balance.isLessThan(money)) {
      throw new DomainError({
        code: 'WALLET_INSUFFICIENT_FUNDS',
        message: 'Insufficient funds',
        details: { userId: this._userId, attempted: amount },
      });
    }
    this._balance = this._balance.subtract(money);
    this.recordTransaction('withdraw', money.amount, description);
  }

  lock(amount: number): void {
    this.ensurePositiveAmount(amount);
    const money = this.createMoney(amount);
    if (this._balance.isLessThan(money)) {
      throw new DomainError({
        code: 'WALLET_INSUFFICIENT_FUNDS',
        message: 'Insufficient funds',
        details: { userId: this._userId, attempted: amount },
      });
    }
    this._balance = this._balance.subtract(money);
    this._lockedBalance = this._lockedBalance.add(money);
    this.recordTransaction('lock', money.amount);
  }

  unlock(amount: number): void {
    this.ensurePositiveAmount(amount);
    const money = this.createMoney(amount);
    if (this._lockedBalance.isLessThan(money)) {
      throw new DomainError({
        code: 'WALLET_LOCKED_BALANCE_EXCEEDED',
        message: 'Amount exceeds locked balance',
        details: { userId: this._userId, attempted: amount },
      });
    }
    this._lockedBalance = this._lockedBalance.subtract(money);
    this._balance = this._balance.add(money);
    this.recordTransaction('unlock', money.amount);
  }

  withdrawLocked(amount: number): void {
    this.ensurePositiveAmount(amount);
    const money = this.createMoney(amount);
    if (this._lockedBalance.isLessThan(money)) {
      throw new DomainError({
        code: 'WALLET_INSUFFICIENT_LOCKED_FUNDS',
        message: 'Insufficient locked funds',
        details: { userId: this._userId, attempted: amount },
      });
    }
    this._lockedBalance = this._lockedBalance.subtract(money);
    this.recordTransaction('withdraw_locked', money.amount);
  }

  toDTO(): IWalletDTO {
    return {
      userId: this._userId,
      balance: this.balance,
      lockedBalance: this.lockedBalance,
      currency: this.currency,
    };
  }

  getTransactions(): Transaction[] {
    return [...this._transactions];
  }

  private createMoney(amount: number): Money {
    return new Money(amount, this.currency);
  }

  private ensurePositiveAmount(amount: number): void {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      throw new DomainError({
        code: 'WALLET_INVALID_AMOUNT',
        message: 'Amount must be positive',
        details: { amount },
      });
    }
  }

  private recordTransaction(type: TransactionType, amount: number, description?: string): void {
    try {
      const tx = new Transaction(
        randomUUID(),
        this._userId,
        type,
        amount,
        this.currency,
        description,
        new Date(),
      );
      this._transactions.unshift(tx);
    } catch (error) {
      // Do not block wallet operations if logging fails
    }
  }
}
