import { IWalletDTO } from '../../types/wallet.types';
import { TransactionMetadata } from './Transaction';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { Money, SupportedCurrency } from '@/core/shared/domain/value-objects/Money';
import { Currency, CurrencyValueObject } from '../value-objects/Currency';

export class Wallet {
  private _balance: Money;
  private _lockedBalance: Money;

  constructor(
    private readonly _userId: string,
    currency: Currency,
    private _version = 1,
  ) {
    const validatedCurrency = new CurrencyValueObject(currency).toString();
    this._balance = new Money(0, validatedCurrency);
    this._lockedBalance = new Money(0, validatedCurrency);
  }

  get userId(): string {
    return this._userId;
  }

  get version(): number {
    return this._version;
  }

  incrementVersion(): void {
    this._version += 1;
  }

  get balance(): number {
    return this._balance.amount;
  }

  get balanceCents(): number {
    return this._balance.getCents();
  }

  get lockedBalance(): number {
    return this._lockedBalance.amount;
  }

  get lockedBalanceCents(): number {
    return this._lockedBalance.getCents();
  }

  get currency(): Currency {
    return this._balance.currency;
  }

  deposit(amount: number): void {
    this.ensurePositiveAmount(amount);
    const money = this.createMoney(amount);
    this._balance = this._balance.add(money);
  }

  withdraw(amount: number): void {
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
  }

  toDTO(): IWalletDTO {
    return {
      userId: this._userId,
      balance: this.balance,
      lockedBalance: this.lockedBalance,
      currency: this.currency,
    };
  }

  private createMoney(amount: number): Money {
    return new Money(amount, this.currency as SupportedCurrency);
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
}

export type TransactionContext = {
  description?: string;
  metadata?: TransactionMetadata;
  type?: import('./LedgerEntry').LedgerOperationType;
  referenceId?: string;
  source?: string;
  status?: import('./LedgerEntry').LedgerStatus;
};
