import { Currency } from '../value-objects/Currency';

export class CreditPackage {
  constructor(
    public readonly id: string,
    public readonly code: string,
    public readonly label: string,
    public readonly baseAmount: number,
    public readonly bonusAmount: number,
    public readonly currency: Currency,
    public readonly price: number,
    public readonly description?: string,
    public readonly isActive: boolean = true,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date(),
  ) {
    if (baseAmount < 0 || bonusAmount < 0 || price < 0) {
      throw new Error('Valores inválidos para pacote de créditos');
    }
  }

  get totalCredits(): number {
    return this.baseAmount + this.bonusAmount;
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
