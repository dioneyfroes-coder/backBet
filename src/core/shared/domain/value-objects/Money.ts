/**
 * Value Object base: representa um valor monetário.
 * Reutilizável em betting, finance e qualquer core que trabalhe com dinheiro.
 */
export class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: 'BRL' | 'USD' | 'EUR'
  ) {
    this.validate();
  }

  private validate(): void {
    if (typeof this.amount !== 'number' || this.amount < 0) {
      throw new Error('Invalid money amount');
    }
    if (!['BRL', 'USD', 'EUR'].includes(this.currency)) {
      throw new Error('Invalid currency');
    }
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Cannot add money with different currencies');
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Cannot subtract money with different currencies');
    }
    const result = this.amount - other.amount;
    if (result < 0) {
      throw new Error('Result would be negative');
    }
    return new Money(result, this.currency);
  }

  multiply(factor: number): Money {
    if (factor < 0) {
      throw new Error('Cannot multiply by negative factor');
    }
    return new Money(this.amount * factor, this.currency);
  }

  isGreaterThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new Error('Cannot compare money with different currencies');
    }
    return this.amount > other.amount;
  }

  isLessThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new Error('Cannot compare money with different currencies');
    }
    return this.amount < other.amount;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  toString(): string {
    return `${this.currency} ${this.amount.toFixed(2)}`;
  }
}
