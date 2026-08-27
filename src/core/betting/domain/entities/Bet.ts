//src/core/betting/domain/entities/Bet.ts

import { BetStatus, BetType } from '../../types/bet.types';
import { Odds } from '@core/odds/domain/value-objects/Odds';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { Money, SupportedCurrency } from '@/core/shared/domain/value-objects/Money';

export class Bet {
  private _status: BetStatus;
  private _resolvedAt?: Date;
  private _cancellationReason?: string;

  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly eventId: string,
    public readonly marketId: string,
    public readonly amount: Money,
    public readonly odds: Odds,
    status: BetStatus,
    public readonly type: BetType,
    public readonly createdAt: Date,
    resolvedAt?: Date,
    cancellationReason?: string,
    private _version = 1,
  ) {
    this._status = status;
    this._resolvedAt = resolvedAt;
    this._cancellationReason = cancellationReason;
    this.validate();
  }

  // ---------- Getters ----------
  get status(): BetStatus {
    return this._status;
  }

  get resolvedAt(): Date | undefined {
    return this._resolvedAt;
  }

  get cancellationReason(): string | undefined {
    return this._cancellationReason;
  }

  get version(): number {
    return this._version;
  }

  incrementVersion(): void {
    this._version += 1;
  }

  get potentialReturn(): number {
    return this.amount.multiply(this.odds.value).amount;
  }

  get potentialReturnCents(): number {
    return this.amount.multiply(this.odds.value).getCents();
  }

  get amountCents(): number {
    return this.amount.getCents();
  }

  // ---------- Domain Methods ----------
  resolve(result: 'WON' | 'LOST'): void {
    if (this._status !== 'PENDING') {
      throw new DomainError({
        code: 'BET_NOT_PENDING',
        message: 'Only pending bets can be resolved.',
      });
    }

    this._status = result;
    this._resolvedAt = new Date();
  }

  cancel(reason: string): void {
    if (this._status !== 'PENDING') {
      throw new DomainError({
        code: 'BET_NOT_PENDING',
        message: 'Only pending bets can be canceled.',
      });
    }

    this._status = 'CANCELED';
    this._cancellationReason = reason;
    this._resolvedAt = new Date();
  }

  // ---------- Validation ----------
  private validate(): void {
    const isNonEmptyString = (val: any): val is string =>
      typeof val === 'string' && val.trim().length > 0;

    if (!isNonEmptyString(this.id)) {
      throw new DomainError({ code: 'BET_INVALID_ID', message: 'Invalid bet ID' });
    }
    if (!isNonEmptyString(this.userId)) {
      throw new DomainError({ code: 'BET_INVALID_USER', message: 'Invalid user ID' });
    }
    if (!isNonEmptyString(this.eventId)) {
      throw new DomainError({ code: 'BET_INVALID_EVENT', message: 'Invalid event ID' });
    }
    if (!isNonEmptyString(this.marketId)) {
      throw new DomainError({ code: 'BET_INVALID_MARKET', message: 'Invalid market ID' });
    }

    if (!(this.createdAt instanceof Date)) {
      throw new DomainError({ code: 'BET_INVALID_CREATED_AT', message: 'Invalid creation date' });
    }

    if (this._resolvedAt && !(this._resolvedAt instanceof Date)) {
      throw new DomainError({
        code: 'BET_INVALID_RESOLVED_AT',
        message: 'Invalid resolution date',
      });
    }

    if (this.amount.getCents() <= 0) {
      throw new DomainError({
        code: 'BET_AMOUNT_NON_POSITIVE',
        message: 'Bet amount must be greater than 0',
        details: { amount: this.amount.amount },
      });
    }
  }

  // ---------- Utility ----------
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      userId: this.userId,
      eventId: this.eventId,
      marketId: this.marketId,
      amount: this.amount.amount,
      odds: this.odds.value,
      status: this._status,
      type: this.type,
      createdAt: this.createdAt,
      resolvedAt: this._resolvedAt,
      cancellationReason: this._cancellationReason,
      potentialReturn: this.potentialReturn,
    };
  }
}
