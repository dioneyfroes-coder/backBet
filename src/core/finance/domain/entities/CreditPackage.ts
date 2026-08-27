import { Currency } from '../value-objects/Currency';

export class CreditPackage {
  constructor(
    public readonly id: string,
    public readonly code: string,
    public readonly label: string,
    public readonly baseAmountCents: number,
    public readonly bonusAmountCents: number,
    public readonly currency: Currency,
    public readonly priceCents: number,
    public readonly description?: string,
    public readonly isActive: boolean = true,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date(),
  ) {
    if (baseAmountCents < 0 || bonusAmountCents < 0 || priceCents < 0) {
      throw new Error('Valores inválidos para pacote de créditos');
    }
  }

  get totalCreditsCents(): number {
    return this.baseAmountCents + this.bonusAmountCents;
  }

  get baseAmount(): number {
    return this.baseAmountCents / 100;
  }

  get bonusAmount(): number {
    return this.bonusAmountCents / 100;
  }

  get totalCredits(): number {
    return this.totalCreditsCents / 100;
  }

  get price(): number {
    return this.priceCents / 100;
  }

  toDTO() {
    return {
      id: this.id,
      code: this.code,
      label: this.label,
      baseAmount: this.baseAmount,
      bonusAmount: this.bonusAmount,
      totalCredits: this.totalCredits,
      currency: this.currency,
      price: this.price,
      description: this.description,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
