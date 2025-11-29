import { Odds } from '@core/odds/domain/value-objects/Odds';
import { DomainError } from '@/core/shared/domain/errors/DomainError';

describe('Odds value object', () => {
  it('calculates potential return and exposes JSON', () => {
    const odds = new Odds(2.5);

    expect(odds.value).toBe(2.5);
    expect(odds.calculatePotentialReturn(100)).toBe(250);
    expect(odds.toString()).toBe('2.50');
    expect(odds.toJSON()).toEqual({ value: 2.5 });
  });

  it('throws when odds are out of range', () => {
    expect(() => new Odds(0.5)).toThrow(DomainError);
    expect(() => new Odds(0.5)).toThrow('Odds must be greater than or equal to 1.01');
    expect(() => new Odds(1001)).toThrow(DomainError);
    expect(() => new Odds(1001)).toThrow('Odds cannot be greater than 1000');
  });

  it('throws when value is not a number', () => {
    expect(() => new Odds('abc' as unknown as number)).toThrow(DomainError);
    expect(() => new Odds('abc' as unknown as number)).toThrow('Odds value must be a valid number');
  });

  it('throws when stakeholder is invalid', () => {
    const odds = new Odds(1.2);
    expect(() => odds.calculatePotentialReturn(-1)).toThrow(DomainError);
    expect(() => odds.calculatePotentialReturn(-1)).toThrow('Invalid stake amount');
    expect(() => odds.calculatePotentialReturn(NaN)).toThrow(DomainError);
    expect(() => odds.calculatePotentialReturn(NaN)).toThrow('Invalid stake amount');
  });

  it('returns a new Odds when updated', () => {
    const odds = new Odds(1.5);
    const updated = odds.update(2.1);

    expect(updated).not.toBe(odds);
    expect(updated.value).toBe(2.1);
    expect(() => odds.update(0.5)).toThrow(DomainError);
    expect(() => odds.update(0.5)).toThrow('Odds must be greater than or equal to 1.01');
    expect(() => odds.update(NaN)).toThrow(DomainError);
    expect(() => odds.update(NaN)).toThrow('Odds value must be a valid number');
  });
});
