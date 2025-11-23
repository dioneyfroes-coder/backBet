export type Currency = 'BRL' | 'USD' | 'EUR';

import { DomainError } from '@/core/shared/domain/errors/DomainError';

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
