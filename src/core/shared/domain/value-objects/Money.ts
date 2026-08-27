/**
 * Value Object base: representa um valor monetário.
 * Reutilizável em betting, finance e qualquer core que trabalhe com dinheiro.
 *
 * Representação interna: centavos (integer).
 * Persistência: use getCents() / Money.fromCents().
 * API: use .amount (decimal).
 */
import { DomainError } from '@/core/shared/domain/errors/DomainError';

const SUPPORTED_CURRENCIES = ['BRL', 'USD', 'EUR'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export class Money {
  private readonly _cents: number;

  constructor(
    amount: number,
    public readonly currency: SupportedCurrency,
  ) {
    this.validate(amount);
    this._cents = Math.round(amount * 100);
  }

  /**
   * Cria Money a partir de centavos inteiros (para persistência).
   * Ex: Money.fromCents(15783, 'BRL') → R$ 157,83
   */
  static fromCents(cents: number, currency: SupportedCurrency): Money {
    if (!Number.isFinite(cents) || !Number.isInteger(cents)) {
      throw new DomainError({
        code: 'MONEY_INVALID_CENTS',
        message: 'Cents must be a finite integer',
        details: { cents },
      });
    }
    const instance = Object.create(Money.prototype) as Money;
    Object.defineProperty(instance, '_cents', { value: cents, writable: false });
    Object.defineProperty(instance, 'currency', { value: currency, writable: false });
    return instance;
  }

  /**
   * Retorna o valor em centavos inteiros (para persistência).
   * Ex: new Money(157.83, 'BRL').getCents() → 15783
   */
  getCents(): number {
    return this._cents;
  }

  get amount(): number {
    return this._cents / 100;
  }

  /**
   * Calcula a liability de uma aposta: stake × (odds - 1).
   * Resultado sempre em centavos, sem arredondamento intermediário.
   */
  calculateLiability(oddsValue: number): Money {
    if (!Number.isFinite(oddsValue) || oddsValue < 1.01) {
      throw new DomainError({
        code: 'MONEY_INVALID_ODDS',
        message: 'Odds must be >= 1.01',
        details: { oddsValue },
      });
    }
    const liabilityCents = Math.round(this._cents * (oddsValue - 1));
    return Money.fromCents(liabilityCents, this.currency);
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
    if (this.decimalPlaces(amount) > 2) {
      throw new DomainError({
        code: 'MONEY_TOO_MANY_DECIMALS',
        message: 'Money amount must have at most 2 decimal places',
        details: { amount },
      });
    }
  }

  /**
   * Número de casas decimais do valor, expandindo notação científica
   * (ex: 1e-7 → 7 casas) para nunca arredondar silenciosamente.
   */
  private decimalPlaces(amount: number): number {
    const plain = amount.toLocaleString('en-US', {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
    const dotIndex = plain.indexOf('.');
    return dotIndex === -1 ? 0 : plain.length - dotIndex - 1;
  }

  add(other: Money): Money {
    this.ensureSameCurrency(other, 'Cannot add money with different currencies');
    return Money.fromCents(this._cents + other._cents, this.currency);
  }

  subtract(other: Money): Money {
    this.ensureSameCurrency(other, 'Cannot subtract money with different currencies');
    const result = this._cents - other._cents;
    if (result < 0) {
      throw new DomainError({
        code: 'MONEY_NEGATIVE_RESULT',
        message: 'Result would be negative',
        details: { minuend: this.amount, subtrahend: other.amount },
      });
    }
    return Money.fromCents(result, this.currency);
  }

  multiply(factor: number): Money {
    if (!Number.isFinite(factor) || factor < 0) {
      throw new DomainError({
        code: 'MONEY_NEGATIVE_FACTOR',
        message: 'Cannot multiply by negative factor',
        details: { factor },
      });
    }
    return Money.fromCents(Math.round(this._cents * factor), this.currency);
  }

  isGreaterThan(other: Money): boolean {
    this.ensureSameCurrency(other, 'Cannot compare money with different currencies');
    return this._cents > other._cents;
  }

  isLessThan(other: Money): boolean {
    this.ensureSameCurrency(other, 'Cannot compare money with different currencies');
    return this._cents < other._cents;
  }

  equals(other: Money): boolean {
    return this._cents === other._cents && this.currency === other.currency;
  }

  toString(): string {
    return `${this.currency} ${this.amount.toFixed(2)}`;
  }

  toJSON(): { amount: number; currency: SupportedCurrency } {
    return { amount: this.amount, currency: this.currency };
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
