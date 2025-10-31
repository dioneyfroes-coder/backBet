export type Currency = 'BRL' | 'USD' | 'EUR';

export class CurrencyValueObject {
  constructor(private readonly value: Currency) {
    if (!this.isValid(value)) {
      throw new Error('Invalid currency');
    }
  }

  private isValid(currency: string): currency is Currency {
    return ['BRL', 'USD', 'EUR'].includes(currency);
  }

  toString(): string {
    return this.value;
  }
}