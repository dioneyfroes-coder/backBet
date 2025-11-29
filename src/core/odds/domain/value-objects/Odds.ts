import { DomainError } from '@/core/shared/domain/errors/DomainError';

export enum OddFormat {
  DECIMAL = 'DECIMAL',
  FRACTIONAL = 'FRACTIONAL',
  AMERICAN = 'AMERICAN',
}

export type FractionalOdds = {
  numerator: number;
  denominator: number;
};

export class Odds {
  public static readonly MIN_VALUE = 1.01;
  public static readonly MAX_VALUE = 1000;
  private static readonly FRACTION_PRECISION = 1e-4;
  private static readonly FRACTION_MAX_DEN = 1000;

  constructor(public readonly value: number) {
    this.validate();
    Object.freeze(this);
  }

  private validate(): void {
    if (typeof this.value !== 'number' || isNaN(this.value)) {
      throw new DomainError({
        code: 'ODDS_INVALID_NUMBER',
        message: 'Odds value must be a valid number',
      });
    }

    if (this.value < Odds.MIN_VALUE) {
      throw new DomainError({
        code: 'ODDS_TOO_LOW',
        message: `Odds must be greater than or equal to ${Odds.MIN_VALUE}`,
        details: { min: Odds.MIN_VALUE, received: this.value },
      });
    }

    if (this.value > Odds.MAX_VALUE) {
      throw new DomainError({
        code: 'ODDS_TOO_HIGH',
        message: `Odds cannot be greater than ${Odds.MAX_VALUE}`,
        details: { max: Odds.MAX_VALUE, received: this.value },
      });
    }
  }

  calculatePotentialReturn(stake: number): number {
    if (typeof stake !== 'number' || stake <= 0 || isNaN(stake)) {
      throw new DomainError({
        code: 'ODDS_INVALID_STAKE',
        message: 'Invalid stake amount',
        details: { stake },
      });
    }
    return Number((this.value * stake).toFixed(2));
  }

  compareTo(other: Odds): number {
    if (!(other instanceof Odds)) {
      throw new DomainError({
        code: 'ODDS_COMPARISON_ERROR',
        message: 'Can only compare Odds instances',
      });
    }
    if (this.value === other.value) {
      return 0;
    }
    return this.value > other.value ? 1 : -1;
  }

  toLocalizedString(locale = 'en-US', options?: Intl.NumberFormatOptions): string {
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    });
    return formatter.format(this.value);
  }

  toFractional(): FractionalOdds {
    const fractional = this.value - 1;
    const { numerator, denominator } = Odds.approximateFraction(fractional);
    return { numerator, denominator };
  }

  static fromFractional(numerator: number, denominator: number): Odds {
    if (!Number.isFinite(numerator) || numerator <= 0) {
      throw new DomainError({
        code: 'ODDS_INVALID_FRACTION',
        message: 'Fractional numerator must be > 0',
        details: { numerator },
      });
    }
    if (!Number.isFinite(denominator) || denominator <= 0) {
      throw new DomainError({
        code: 'ODDS_INVALID_FRACTION',
        message: 'Fractional denominator must be > 0',
        details: { denominator },
      });
    }
    const decimal = numerator / denominator + 1;
    return new Odds(Number(decimal.toFixed(4)));
  }

  toAmerican(): number {
    if (this.value >= 2) {
      return Math.round((this.value - 1) * 100);
    }
    const diff = this.value - 1;
    return Math.round(-100 / diff);
  }

  static fromAmerican(american: number): Odds {
    if (!Number.isFinite(american) || Math.abs(american) < 100) {
      throw new DomainError({
        code: 'ODDS_INVALID_AMERICAN',
        message: 'American odds must be >= |100|',
        details: { american },
      });
    }

    let decimal: number;
    if (american > 0) {
      decimal = american / 100 + 1;
    } else {
      decimal = 100 / Math.abs(american) + 1;
    }
    return new Odds(Number(decimal.toFixed(4)));
  }

  toFormat(format: OddFormat): string | FractionalOdds | number {
    switch (format) {
      case OddFormat.DECIMAL:
        return Number(this.value.toFixed(2));
      case OddFormat.FRACTIONAL:
        return this.toFractional();
      case OddFormat.AMERICAN:
        return this.toAmerican();
      default:
        throw new DomainError({
          code: 'ODDS_UNSUPPORTED_FORMAT',
          message: `Unsupported format ${format}`,
        });
    }
  }

  update(newValue: number): Odds {
    return new Odds(newValue);
  }

  toString(): string {
    return this.value.toFixed(2);
  }

  toJSON(): Record<string, any> {
    return { value: this.value };
  }

  private static approximateFraction(value: number): FractionalOdds {
    for (let denominator = 1; denominator <= Odds.FRACTION_MAX_DEN; denominator += 1) {
      const numerator = Math.round(value * denominator);
      const approximation = numerator / denominator;
      if (Math.abs(approximation - value) <= Odds.FRACTION_PRECISION) {
        const { reducedNumerator, reducedDenominator } = Odds.reduceFraction(
          Math.abs(numerator),
          denominator,
        );
        return { numerator: reducedNumerator, denominator: reducedDenominator };
      }
    }
    const scaledNumerator = Math.round(value * Odds.FRACTION_MAX_DEN);
    const reduced = Odds.reduceFraction(Math.abs(scaledNumerator), Odds.FRACTION_MAX_DEN);
    return { numerator: reduced.reducedNumerator, denominator: reduced.reducedDenominator };
  }

  private static reduceFraction(
    numerator: number,
    denominator: number,
  ): { reducedNumerator: number; reducedDenominator: number } {
    const gcd = Odds.greatestCommonDivisor(numerator, denominator);
    return {
      reducedNumerator: numerator / gcd,
      reducedDenominator: denominator / gcd,
    };
  }

  private static greatestCommonDivisor(a: number, b: number): number {
    return b === 0 ? a : Odds.greatestCommonDivisor(b, a % b);
  }
}
