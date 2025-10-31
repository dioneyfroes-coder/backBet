import { EventStatus, MarketStatus } from '../../types/bet.types';
import { Odds } from '../value-objects/Odds';

export class Market {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public status: MarketStatus,
    public readonly odds: Map<string, Odds>,
    public result?: string
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.id || typeof this.id !== 'string') {
      throw new Error('Invalid market ID');
    }

    if (!this.name || typeof this.name !== 'string') {
      throw new Error('Invalid market name');
    }

    if (!this.odds || !(this.odds instanceof Map)) {
      throw new Error('Invalid odds');
    }
  }

  suspend(): void {
    if (this.status === 'CLOSED') {
      throw new Error('Market is already closed');
    }
    this.status = 'SUSPENDED';
  }

  open(): void {
    if (this.status === 'CLOSED') {
      throw new Error('Market is already closed');
    }
    this.status = 'OPEN';
  }

  close(result?: string): void {
    this.status = 'CLOSED';
    if (result) {
      this.result = result;
    }
  }

  updateOdd(key: string, value: number): void {
    if (this.status !== 'OPEN') {
      throw new Error('Cannot update odds on non-open market');
    }
    this.odds.set(key, new Odds(value));
  }
}

export class Event {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly startDate: Date,
    public status: EventStatus,
    public readonly category: string,
    public readonly participants: string[],
    public readonly markets: Map<string, Market>
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.id || typeof this.id !== 'string') {
      throw new Error('Invalid event ID');
    }

    if (!this.name || typeof this.name !== 'string') {
      throw new Error('Invalid event name');
    }

    if (!this.startDate || !(this.startDate instanceof Date)) {
      throw new Error('Invalid start date');
    }

    if (!this.category || typeof this.category !== 'string') {
      throw new Error('Invalid category');
    }

    if (!Array.isArray(this.participants) || this.participants.length < 2) {
      throw new Error('Invalid participants');
    }

    if (!this.markets || !(this.markets instanceof Map)) {
      throw new Error('Invalid markets');
    }
  }

  start(): void {
    if (this.status !== 'SCHEDULED') {
      throw new Error('Event is not scheduled');
    }
    this.status = 'LIVE';
  }

  finish(): void {
    if (this.status !== 'LIVE') {
      throw new Error('Event is not live');
    }
    this.status = 'FINISHED';
  }

  cancel(): void {
    if (this.status === 'FINISHED') {
      throw new Error('Cannot cancel finished event');
    }
    this.status = 'CANCELED';
  }

  addMarket(market: Market): void {
    if (this.status !== 'SCHEDULED') {
      throw new Error('Cannot add markets to non-scheduled event');
    }
    this.markets.set(market.id, market);
  }
}