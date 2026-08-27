/**
 * Currency type — single source of truth for the entire system.
 * Re-exports SupportedCurrency from Money as the canonical type.
 */
import { SupportedCurrency } from '@/core/shared/domain/value-objects/Money';
import { DomainError } from '@/core/shared/domain/errors/DomainError';

export type Currency = SupportedCurrency;

const SUPPORTED_CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR'];

export class CurrencyValueObject {
  constructor(private readonly value: Currency) {
    if (!SUPPORTED_CURRENCIES.includes(value)) {
      throw new DomainError({
        code: 'CURRENCY_INVALID_CODE',
        message: 'Invalid currency',
        details: { currency: value },
      });
    }
  }

  toString(): Currency {
    return this.value;
  }
}
