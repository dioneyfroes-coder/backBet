import { DomainError } from '@/core/shared/domain/errors/DomainError';

export class Odds {
  private static readonly MIN_VALUE = 1.01;
  private static readonly MAX_VALUE = 1000;

  constructor(public readonly value: number) {
    this.validate();
    Object.freeze(this);
  }

  private validate(): void {
    if (typeof this.value !== 'number' || isNaN(this.value)) {
      throw new DomainError({
        code: 'ODDS_INVALID_NUMBER',
        message: 'Odds value must be a valid number',
      });
    }

    if (this.value < Odds.MIN_VALUE) {
      throw new DomainError({
        code: 'ODDS_TOO_LOW',
        message: `Odds must be greater than or equal to ${Odds.MIN_VALUE}`,
        details: { min: Odds.MIN_VALUE, received: this.value },
      });
    }

    if (this.value > Odds.MAX_VALUE) {
      throw new DomainError({
        code: 'ODDS_TOO_HIGH',
        message: `Odds cannot be greater than ${Odds.MAX_VALUE}`,
        details: { max: Odds.MAX_VALUE, received: this.value },
      });
    }
  }

  calculatePotentialReturn(stake: number): number {
    if (typeof stake !== 'number' || stake <= 0 || isNaN(stake)) {
      throw new DomainError({
        code: 'ODDS_INVALID_STAKE',
        message: 'Invalid stake amount',
        details: { stake },
      });
    }
    return Number((this.value * stake).toFixed(2));
  }

  update(newValue: number): Odds {
    return new Odds(newValue);
  }

  toString(): string {
    return this.value.toFixed(2);
  }

  toJSON(): Record<string, any> {
    return { value: this.value };
  }
}
