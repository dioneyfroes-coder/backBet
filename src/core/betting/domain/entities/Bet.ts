import { BetStatus, BetType } from '../../types/bet.types';
import { BetAmount } from '../value-objects/BetAmount';
import { Odds } from '../value-objects/Odds';

export class Bet {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly eventId: string,
    public readonly marketId: string,
    public readonly amount: BetAmount,
    public readonly odds: Odds,
    public status: BetStatus,
    public readonly type: BetType,
    public readonly createdAt: Date,
    public resolvedAt?: Date
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.id || typeof this.id !== 'string') {
      throw new Error('Invalid bet ID');
    }

    if (!this.userId || typeof this.userId !== 'string') {
      throw new Error('Invalid user ID');
    }

    if (!this.eventId || typeof this.eventId !== 'string') {
      throw new Error('Invalid event ID');
    }

    if (!this.marketId || typeof this.marketId !== 'string') {
      throw new Error('Invalid market ID');
    }

    if (!this.createdAt || !(this.createdAt instanceof Date)) {
      throw new Error('Invalid creation date');
    }

    if (this.resolvedAt && !(this.resolvedAt instanceof Date)) {
      throw new Error('Invalid resolution date');
    }
  }

  get potentialReturn(): number {
    return this.odds.calculatePotentialReturn(this.amount.value);
  }

  resolve(result: 'WON' | 'LOST'): void {
    if (this.status !== 'PENDING') {
      throw new Error('Bet is not pending');
    }

    this.status = result;
    this.resolvedAt = new Date();
  }

  cancel(reason: string): void {
    if (this.status !== 'PENDING') {
      throw new Error('Bet is not pending');
    }

    this.status = 'CANCELED';
    this.resolvedAt = new Date();
  }
}