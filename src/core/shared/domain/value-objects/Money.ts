/**
 * Value Object base: representa um valor monetário.
 * Reutilizável em betting, finance e qualquer core que trabalhe com dinheiro.
 */
import { AppError } from '@/shared/errors/AppError';

export class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: 'BRL' | 'USD' | 'EUR'
  ) {
    this.validate();
  }

  private validate(): void {
    if (typeof this.amount !== 'number' || this.amount < 0 || isNaN(this.amount)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid money amount', 400);
    }
    if (!['BRL', 'USD', 'EUR'].includes(this.currency)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid currency', 400);
    }
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new AppError('BAD_REQUEST', 'Cannot add money with different currencies', 400);
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new AppError('BAD_REQUEST', 'Cannot subtract money with different currencies', 400);
    }
    const result = this.amount - other.amount;
    if (result < 0) {
      throw new AppError('BAD_REQUEST', 'Result would be negative', 400);
    }
    return new Money(result, this.currency);
  }

  multiply(factor: number): Money {
    if (factor < 0) {
      throw new AppError('BAD_REQUEST', 'Cannot multiply by negative factor', 400);
    }
    return new Money(this.amount * factor, this.currency);
  }

  isGreaterThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new AppError('BAD_REQUEST', 'Cannot compare money with different currencies', 400);
    }
    return this.amount > other.amount;
  }

  isLessThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new AppError('BAD_REQUEST', 'Cannot compare money with different currencies', 400);
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
