import { BetAmount } from '../BetAmount';
import { DomainError } from '@/core/shared/domain/errors/DomainError';

describe('BetAmount value object', () => {
  it('creates a valid value object and is immutable', () => {
    const amount = new BetAmount(150.5, 'BRL');

    expect(amount.value).toBe(150.5);
    expect(amount.currency).toBe('BRL');
    expect(() => {
      (amount as any).value = 999;
    }).toThrow();
    expect(amount.toString()).toBe('150.50 BRL');
    expect(amount.toJSON()).toEqual({ value: 150.5, currency: 'BRL' });
  });

  it('throws when the amount is not a number or NaN', () => {
    expect(() => new BetAmount('abc' as unknown as number, 'BRL')).toThrow(DomainError);
    expect(() => new BetAmount('abc' as unknown as number, 'BRL')).toThrow(
      'Bet amount must be a valid number',
    );
    expect(() => new BetAmount(NaN, 'BRL')).toThrow(DomainError);
    expect(() => new BetAmount(NaN, 'BRL')).toThrow('Bet amount must be a valid number');
  });

  it('throws when currency is not a string', () => {
    expect(() => new BetAmount(10, 123 as unknown as string)).toThrow(DomainError);
    expect(() => new BetAmount(10, 123 as unknown as string)).toThrow('Invalid currency');
  });

  it('throws when the amount is zero or negative', () => {
    expect(() => new BetAmount(0, 'BRL')).toThrow(DomainError);
    expect(() => new BetAmount(0, 'BRL')).toThrow('Bet amount must be greater than 0');
    expect(() => new BetAmount(-5, 'BRL')).toThrow(DomainError);
    expect(() => new BetAmount(-5, 'BRL')).toThrow('Bet amount must be greater than 0');
  });

  it('throws when the currency is invalid or unsupported', () => {
    expect(() => new BetAmount(10, '')).toThrow(DomainError);
    expect(() => new BetAmount(10, '')).toThrow('Invalid currency');
    expect(() => new BetAmount(10, 'XYZ')).toThrow(DomainError);
    expect(() => new BetAmount(10, 'XYZ')).toThrow('Unsupported currency: XYZ');
  });

  it('throws when the multiplier factor is invalid', () => {
    const amount = new BetAmount(10, 'USD');
    expect(() => amount.multiply(0)).toThrow(DomainError);
    expect(() => amount.multiply(0)).toThrow('Invalid multiplier factor');
    expect(() => amount.multiply(NaN)).toThrow(DomainError);
    expect(() => amount.multiply(NaN)).toThrow('Invalid multiplier factor');
  });

  it('returns a new instance when multiplying', () => {
    const amount = new BetAmount(10, 'EUR');
    const multiplied = amount.multiply(2.5);

    expect(multiplied).not.toBe(amount);
    expect(multiplied.value).toBe(25);
    expect(multiplied.currency).toBe('EUR');
  });
});
