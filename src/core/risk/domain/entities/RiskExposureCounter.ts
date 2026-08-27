import { Money, SupportedCurrency } from '@/core/shared/domain/value-objects/Money';
import { RiskExposureScope } from '@/core/risk/types/risk.types';

export { RiskExposureScope };

export class RiskExposureCounter {
  private _exposure: Money;
  private _maxExposure: Money;

  constructor(
    public readonly scope: RiskExposureScope,
    public readonly refId: string,
    exposureCents: number = 0,
    maxExposureCents: number = 0,
    currency: SupportedCurrency = 'BRL',
  ) {
    this._exposure = Money.fromCents(exposureCents, currency);
    this._maxExposure = Money.fromCents(maxExposureCents, currency);
  }

  get exposureCents(): number {
    return this._exposure.getCents();
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
    const sub = Money.fromCents(amountCents, this._exposure.currency);
    if (this._exposure.isGreaterThan(sub)) {
      this._exposure = this._exposure.subtract(sub);
    } else {
      this._exposure = Money.fromCents(0, this._exposure.currency);
    }
  }

  isOverLimit(): boolean {
    return this._exposure.isGreaterThan(this._maxExposure);
  }
}
