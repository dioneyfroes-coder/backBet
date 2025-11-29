import { FractionalOdds, OddFormat, Odds } from '@core/odds/domain/value-objects/Odds';
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

  it('handles very large stakes preserving rounding to two decimals', () => {
    const odds = new Odds(3.75);
    const stake = 123_456_789.987;

    expect(odds.calculatePotentialReturn(stake)).toBe(462_962_962.45);
  });

  it('handles decimal odds and stakes with many fractional digits', () => {
    const odds = new Odds(1.347891);
    const stake = 10.5555;

    expect(odds.calculatePotentialReturn(stake)).toBe(14.23);
  });

  it('compares odds instances correctly', () => {
    const o1 = new Odds(1.5);
    const o2 = new Odds(1.5);
    const o3 = new Odds(2.1);

    expect(o1.compareTo(o2)).toBe(0);
    expect(o1.compareTo(o3)).toBe(-1);
    expect(o3.compareTo(o1)).toBe(1);
  });

  it('formats odds for locales and converts between formats', () => {
    const odds = new Odds(3.5);

    expect(odds.toLocalizedString('pt-BR')).toBe('3,50');

    const fractional: FractionalOdds = odds.toFractional();
    expect(fractional).toEqual({ numerator: 5, denominator: 2 });
    expect(odds.toFormat(OddFormat.FRACTIONAL)).toEqual({ numerator: 5, denominator: 2 });

    expect(odds.toAmerican()).toBe(250);
    expect(odds.toFormat(OddFormat.AMERICAN)).toBe(250);
    expect(odds.toFormat(OddFormat.DECIMAL)).toBe(3.5);
  });

  it('creates odds from fractional and american formats', () => {
    const fromFractional = Odds.fromFractional(5, 2);
    expect(fromFractional.value).toBeCloseTo(3.5, 5);

    const fromAmericanPositive = Odds.fromAmerican(250);
    expect(fromAmericanPositive.value).toBeCloseTo(3.5, 5);

    const fromAmericanNegative = Odds.fromAmerican(-150);
    expect(fromAmericanNegative.value).toBeCloseTo(1.6667, 4);
  });

  it('throws on invalid fractional or american conversions', () => {
    expect(() => Odds.fromFractional(0, 2)).toThrow('Fractional numerator must be > 0');
    expect(() => Odds.fromFractional(5, 0)).toThrow('Fractional denominator must be > 0');
    expect(() => Odds.fromAmerican(50)).toThrow('American odds must be >= |100|');
  });
});
