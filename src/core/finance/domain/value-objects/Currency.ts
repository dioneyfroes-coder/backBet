export type Currency = 'BRL' | 'USD' | 'EUR';

import { AppError } from '@/shared/errors/AppError';

export class CurrencyValueObject {
  constructor(private readonly value: Currency) {
    if (!this.isValid(value)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid currency', 400);
    }
  }

  private isValid(currency: string): currency is Currency {
    return ['BRL', 'USD', 'EUR'].includes(currency);
  }

  toString(): string {
    return this.value;
  }
}
