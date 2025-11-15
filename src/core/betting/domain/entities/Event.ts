import { EventStatus, MarketStatus } from '../../types/bet.types';
import { Odds } from '../value-objects/Odds';
import { AppError } from '@/shared/errors/AppError';

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
    if (this._status === 'CLOSED') throw new AppError('BAD_REQUEST', 'Market is already closed', 400);
    if (this._status === 'SUSPENDED') throw new AppError('BAD_REQUEST', 'Market is already suspended', 400);
    this._status = 'SUSPENDED';
  }

  open(): void {
    if (this._status === 'CLOSED') throw new AppError('BAD_REQUEST', 'Market is already closed', 400);
    this._status = 'OPEN';
  }

  close(result?: string): void {
    if (this._status === 'CLOSED') throw new AppError('BAD_REQUEST', 'Market is already closed', 400);
    this._status = 'CLOSED';
    if (result) this._result = result;
  }

  updateOdd(key: string, value: number): void {
    if (this._status !== 'OPEN') throw new AppError('BAD_REQUEST', 'Cannot update odds on non-open market', 400);
    this.odds.set(key, new Odds(value));
  }

  // Validation
  private validate(): void {
    const isNonEmptyString = (val: any): val is string =>
      typeof val === 'string' && val.trim().length > 0;

    if (!isNonEmptyString(this.id)) throw new AppError('VALIDATION_ERROR', 'Invalid market ID', 400);
    if (!isNonEmptyString(this.name)) throw new AppError('VALIDATION_ERROR', 'Invalid market name', 400);
    if (!(this.odds instanceof Map)) throw new AppError('VALIDATION_ERROR', 'Invalid odds', 400);
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
    if (this._status !== 'SCHEDULED') throw new AppError('BAD_REQUEST', 'Event is not scheduled', 400);
    this._status = 'LIVE';
  }

  finish(): void {
    if (this._status !== 'LIVE') throw new AppError('BAD_REQUEST', 'Event is not live', 400);
    this._status = 'FINISHED';
  }

  cancel(): void {
    if (this._status === 'FINISHED') throw new AppError('BAD_REQUEST', 'Cannot cancel finished event', 400);
    if (this._status === 'CANCELED') throw new AppError('BAD_REQUEST', 'Event is already canceled', 400);
    this._status = 'CANCELED';
  }

  addMarket(market: Market): void {
    if (this._status !== 'SCHEDULED') throw new AppError('BAD_REQUEST', 'Cannot add markets to non-scheduled event', 400);
    this.markets.set(market.id, market);
  }

  // Validation
  private validate(): void {
    const isNonEmptyString = (val: any): val is string =>
      typeof val === 'string' && val.trim().length > 0;

    if (!isNonEmptyString(this.id)) throw new AppError('VALIDATION_ERROR', 'Invalid event ID', 400);
    if (!isNonEmptyString(this.name)) throw new AppError('VALIDATION_ERROR', 'Invalid event name', 400);
    if (!(this.startDate instanceof Date)) throw new AppError('VALIDATION_ERROR', 'Invalid start date', 400);
    if (!isNonEmptyString(this.category)) throw new AppError('VALIDATION_ERROR', 'Invalid category', 400);
    if (!Array.isArray(this.participants) || this.participants.length < 2)
      throw new AppError('VALIDATION_ERROR', 'Invalid participants', 400);
    if (!(this.markets instanceof Map)) throw new AppError('VALIDATION_ERROR', 'Invalid markets', 400);
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
