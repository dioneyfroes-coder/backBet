import { Money, SupportedCurrency } from '@/core/shared/domain/value-objects/Money';
import { RiskExposureUnderflowError } from '@/core/risk/domain/errors/RiskExposureUnderflowError';

export class RiskProfile {
  private _exposure: Money;
  private _maxExposure: Money;

  constructor(
    public readonly userId: string,
    exposureCents: number = 0,
    maxExposureCents: number = 0,
    currency: SupportedCurrency = 'BRL',
  ) {
    this._exposure = Money.fromCents(exposureCents, currency);
    this._maxExposure = Money.fromCents(maxExposureCents, currency);
  }

  get exposure(): number {
    return this._exposure.amount;
  }

  get exposureCents(): number {
    return this._exposure.getCents();
  }

  get maxExposure(): number {
    return this._maxExposure.amount;
  }

  get maxExposureCents(): number {
    return this._maxExposure.getCents();
  }

  get currency(): SupportedCurrency {
    return this._exposure.currency;
  }

  increaseExposure(amountCents: number): void {
    this._exposure = this._exposure.add(Money.fromCents(amountCents, this._exposure.currency));
  }

  decreaseExposure(amountCents: number): void {
    const currentCents = this._exposure.getCents();
    if (amountCents < 0 || currentCents < amountCents) {
      throw new RiskExposureUnderflowError({
        scope: 'USER',
        refId: this.userId,
        requestedCents: amountCents,
        currentCents,
        recordExists: true,
      });
    }
    this._exposure = this._exposure.subtract(
      Money.fromCents(amountCents, this._exposure.currency),
    );
  }

  isOverLimit(): boolean {
    return this._exposure.isGreaterThan(this._maxExposure);
  }
}
