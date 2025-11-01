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
      throw new Error('Bet amount must be a valid number');
    }

    if (this.value <= 0) {
      throw new Error('Bet amount must be greater than 0');
    }

    if (typeof this.currency !== 'string' || !this.currency.trim()) {
      throw new Error('Invalid currency');
    }

    if (!BetAmount.SUPPORTED_CURRENCIES.includes(this.currency as any)) {
      throw new Error(`Unsupported currency: ${this.currency}`);
    }
  }

  multiply(factor: number): BetAmount {
    if (factor <= 0 || isNaN(factor)) {
      throw new Error('Invalid multiplier factor');
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
