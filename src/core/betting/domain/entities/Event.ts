import { EventStatus, MarketStatus } from '../../types/bet.types';
import { Odds } from '../value-objects/Odds';
import { DomainError } from '@/core/shared/domain/errors/DomainError';

// ---------- MARKET ----------
export class Market {
  private _status: MarketStatus;
  private _result: string | undefined;

  constructor(
    public readonly id: string,
    public readonly name: string,
    status: MarketStatus,
    public readonly odds: Map<string, Odds>,
    result?: string,
  ) {
    this._status = status;
    this._result = result;
    this.validate();
  }

  // Getters
  get status(): MarketStatus {
    return this._status;
  }

  get result(): string | undefined {
    return this._result;
  }

  // Domain methods
  suspend(): void {
    if (this._status === 'CLOSED') {
      throw new DomainError({ code: 'MARKET_CLOSED', message: 'Market is already closed' });
    }
    if (this._status === 'SUSPENDED') {
      throw new DomainError({ code: 'MARKET_SUSPENDED', message: 'Market is already suspended' });
    }
    this._status = 'SUSPENDED';
  }

  open(): void {
    if (this._status === 'CLOSED') {
      throw new DomainError({ code: 'MARKET_CLOSED', message: 'Market is already closed' });
    }
    this._status = 'OPEN';
  }

  close(result?: string): void {
    if (this._status === 'CLOSED') {
      throw new DomainError({ code: 'MARKET_CLOSED', message: 'Market is already closed' });
    }
    this._status = 'CLOSED';
    if (result) this._result = result;
  }

  updateOdd(key: string, value: number): void {
    if (this._status !== 'OPEN') {
      throw new DomainError({
        code: 'MARKET_NOT_OPEN',
        message: 'Cannot update odds on non-open market',
      });
    }
    this.odds.set(key, new Odds(value));
  }

  // Validation
  private validate(): void {
    const isNonEmptyString = (val: any): val is string =>
      typeof val === 'string' && val.trim().length > 0;

    if (!isNonEmptyString(this.id)) {
      throw new DomainError({ code: 'MARKET_INVALID_ID', message: 'Invalid market ID' });
    }
    if (!isNonEmptyString(this.name)) {
      throw new DomainError({ code: 'MARKET_INVALID_NAME', message: 'Invalid market name' });
    }
    if (!(this.odds instanceof Map)) {
      throw new DomainError({ code: 'MARKET_INVALID_ODDS', message: 'Invalid odds' });
    }
  }

  // Optional utility
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      status: this._status,
      result: this._result,
      odds: Object.fromEntries(
        Array.from(this.odds.entries()).map(([key, odd]) => [key, odd.value]),
      ),
    };
  }
}

// ---------- EVENT ----------
export class Event {
  private _status: EventStatus;

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly startDate: Date,
    status: EventStatus,
    public readonly category: string,
    public readonly participants: string[],
    public readonly markets: Map<string, Market>,
  ) {
    this._status = status;
    this.validate();
  }

  // Getters
  get status(): EventStatus {
    return this._status;
  }

  // Domain methods
  start(): void {
    if (this._status !== 'SCHEDULED') {
      throw new DomainError({ code: 'EVENT_NOT_SCHEDULED', message: 'Event is not scheduled' });
    }
    this._status = 'LIVE';
  }

  finish(): void {
    if (this._status !== 'LIVE') {
      throw new DomainError({ code: 'EVENT_NOT_LIVE', message: 'Event is not live' });
    }
    this._status = 'FINISHED';
  }

  cancel(): void {
    if (this._status === 'FINISHED') {
      throw new DomainError({ code: 'EVENT_FINISHED', message: 'Cannot cancel finished event' });
    }
    if (this._status === 'CANCELED') {
      throw new DomainError({
        code: 'EVENT_ALREADY_CANCELED',
        message: 'Event is already canceled',
      });
    }
    this._status = 'CANCELED';
  }

  addMarket(market: Market): void {
    if (this._status !== 'SCHEDULED') {
      throw new DomainError({
        code: 'EVENT_NOT_SCHEDULED',
        message: 'Cannot add markets to non-scheduled event',
      });
    }
    this.markets.set(market.id, market);
  }

  // Validation
  private validate(): void {
    const isNonEmptyString = (val: any): val is string =>
      typeof val === 'string' && val.trim().length > 0;

    if (!isNonEmptyString(this.id)) {
      throw new DomainError({ code: 'EVENT_INVALID_ID', message: 'Invalid event ID' });
    }
    if (!isNonEmptyString(this.name)) {
      throw new DomainError({ code: 'EVENT_INVALID_NAME', message: 'Invalid event name' });
    }
    if (!(this.startDate instanceof Date)) {
      throw new DomainError({ code: 'EVENT_INVALID_START_DATE', message: 'Invalid start date' });
    }
    if (!isNonEmptyString(this.category)) {
      throw new DomainError({ code: 'EVENT_INVALID_CATEGORY', message: 'Invalid category' });
    }
    if (!Array.isArray(this.participants) || this.participants.length < 2) {
      throw new DomainError({
        code: 'EVENT_INVALID_PARTICIPANTS',
        message: 'Invalid participants',
      });
    }
    if (!(this.markets instanceof Map)) {
      throw new DomainError({ code: 'EVENT_INVALID_MARKETS', message: 'Invalid markets' });
    }
  }

  toJSON(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      status: this._status,
      startDate: this.startDate,
      participants: this.participants,
      markets: Object.fromEntries(
        Array.from(this.markets.entries()).map(([id, market]) => [id, market.toJSON()]),
      ),
    };
  }
}
