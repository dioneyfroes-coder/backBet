import { DomainError } from '@/core/shared/domain/errors/DomainError';

export class BetAmount {
  private static readonly SUPPORTED_CURRENCIES = ['BRL', 'USD', 'EUR'] as const;

  constructor(
    public readonly value: number,
    public readonly currency: string,
  ) {
    this.validate();
    Object.freeze(this); // garante imutabilidade real do value object
  }

  private validate(): void {
    if (typeof this.value !== 'number' || isNaN(this.value)) {
      throw new DomainError({
        code: 'BET_AMOUNT_INVALID_NUMBER',
        message: 'Bet amount must be a valid number',
      });
    }

    if (this.value <= 0) {
      throw new DomainError({
        code: 'BET_AMOUNT_NON_POSITIVE',
        message: 'Bet amount must be greater than 0',
      });
    }

    if (typeof this.currency !== 'string' || !this.currency.trim()) {
      throw new DomainError({ code: 'BET_AMOUNT_INVALID_CURRENCY', message: 'Invalid currency' });
    }

    if (!BetAmount.SUPPORTED_CURRENCIES.includes(this.currency as any)) {
      throw new DomainError({
        code: 'BET_AMOUNT_UNSUPPORTED_CURRENCY',
        message: `Unsupported currency: ${this.currency}`,
        details: { currency: this.currency },
      });
    }
  }

  multiply(factor: number): BetAmount {
    if (factor <= 0 || isNaN(factor)) {
      throw new DomainError({
        code: 'BET_AMOUNT_INVALID_MULTIPLIER',
        message: 'Invalid multiplier factor',
      });
    }
    return new BetAmount(this.value * factor, this.currency);
  }

  toString(): string {
    return `${this.value.toFixed(2)} ${this.currency}`;
  }

  toJSON(): Record<string, any> {
    return {
      value: this.value,
      currency: this.currency,
    };
  }
}
