/**
 * Value Object base: representa um valor monetário.
 * Reutilizável em betting, finance e qualquer core que trabalhe com dinheiro.
 */
import { DomainError } from '@/core/shared/domain/errors/DomainError';

const SUPPORTED_CURRENCIES = ['BRL', 'USD', 'EUR'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export class Money {
  private readonly cents: number;

  constructor(
    amount: number,
    public readonly currency: SupportedCurrency,
  ) {
    this.validate(amount);
    this.cents = Math.round(amount * 100);
  }

  get amount(): number {
    return this.cents / 100;
  }

  private validate(amount: number): void {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      throw new DomainError({
        code: 'MONEY_INVALID_AMOUNT',
        message: 'Invalid money amount',
        details: { amount },
      });
    }
    if (!SUPPORTED_CURRENCIES.includes(this.currency)) {
      throw new DomainError({
        code: 'MONEY_INVALID_CURRENCY',
        message: 'Invalid currency',
        details: { currency: this.currency },
      });
    }
  }

  add(other: Money): Money {
    this.ensureSameCurrency(other, 'Cannot add money with different currencies');
    return new Money((this.cents + other.cents) / 100, this.currency);
  }

  subtract(other: Money): Money {
    this.ensureSameCurrency(other, 'Cannot subtract money with different currencies');
    const result = this.cents - other.cents;
    if (result < 0) {
      throw new DomainError({
        code: 'MONEY_NEGATIVE_RESULT',
        message: 'Result would be negative',
        details: { minuend: this.amount, subtrahend: other.amount },
      });
    }
    return new Money(result / 100, this.currency);
  }

  multiply(factor: number): Money {
    if (!Number.isFinite(factor) || factor < 0) {
      throw new DomainError({
        code: 'MONEY_NEGATIVE_FACTOR',
        message: 'Cannot multiply by negative factor',
        details: { factor },
      });
    }
    return new Money(Math.round(this.cents * factor) / 100, this.currency);
  }

  isGreaterThan(other: Money): boolean {
    this.ensureSameCurrency(other, 'Cannot compare money with different currencies');
    return this.amount > other.amount;
  }

  isLessThan(other: Money): boolean {
    this.ensureSameCurrency(other, 'Cannot compare money with different currencies');
    return this.amount < other.amount;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  toString(): string {
    return `${this.currency} ${this.amount.toFixed(2)}`;
  }

  private ensureSameCurrency(other: Money, message: string): void {
    if (this.currency !== other.currency) {
      throw new DomainError({
        code: 'MONEY_CURRENCY_MISMATCH',
        message,
        details: { left: this.currency, right: other.currency },
      });
    }
  }
}
