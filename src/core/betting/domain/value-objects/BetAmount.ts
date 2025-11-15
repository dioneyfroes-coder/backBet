import { AppError } from '@/shared/errors/AppError';

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
      throw new AppError('VALIDATION_ERROR', 'Bet amount must be a valid number', 400);
    }

    if (this.value <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Bet amount must be greater than 0', 400);
    }

    if (typeof this.currency !== 'string' || !this.currency.trim()) {
      throw new AppError('VALIDATION_ERROR', 'Invalid currency', 400);
    }

    if (!BetAmount.SUPPORTED_CURRENCIES.includes(this.currency as any)) {
      throw new AppError('VALIDATION_ERROR', `Unsupported currency: ${this.currency}`, 400);
    }
  }

  multiply(factor: number): BetAmount {
    if (factor <= 0 || isNaN(factor)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid multiplier factor', 400);
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
