export class BetAmount {
  constructor(
    public readonly value: number,
    public readonly currency: string
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.value || typeof this.value !== 'number') {
      throw new Error('Invalid bet amount');
    }

    if (this.value <= 0) {
      throw new Error('Bet amount must be greater than 0');
    }

    if (!this.currency || typeof this.currency !== 'string') {
      throw new Error('Invalid currency');
    }

    const supportedCurrencies = ['BRL', 'USD', 'EUR'];
    if (!supportedCurrencies.includes(this.currency)) {
      throw new Error('Unsupported currency');
    }
  }

  toString(): string {
    return `${this.value.toFixed(2)} ${this.currency}`;
  }
}