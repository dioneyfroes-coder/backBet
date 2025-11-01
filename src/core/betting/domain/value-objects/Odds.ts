export class Odds {
  private static readonly MIN_VALUE = 1.01;
  private static readonly MAX_VALUE = 1000;

  constructor(public readonly value: number) {
    this.validate();
    Object.freeze(this); // garante imutabilidade total
  }

  private validate(): void {
    if (typeof this.value !== 'number' || isNaN(this.value)) {
      throw new Error('Odds value must be a valid number');
    }

    if (this.value < Odds.MIN_VALUE) {
      throw new Error(`Odds must be greater than or equal to ${Odds.MIN_VALUE}`);
    }

    if (this.value > Odds.MAX_VALUE) {
      throw new Error(`Odds cannot be greater than ${Odds.MAX_VALUE}`);
    }
  }

  /**
   * Calcula o retorno potencial com base no valor apostado.
   * @param stake - Valor apostado
   * @returns Valor potencial de retorno
   */
  calculatePotentialReturn(stake: number): number {
    if (typeof stake !== 'number' || stake <= 0 || isNaN(stake)) {
      throw new Error('Invalid stake amount');
    }
    return Number((this.value * stake).toFixed(2)); // garante precisão de casas decimais
  }

  /**
   * Retorna uma nova instância com as odds ajustadas (por exemplo, atualização de mercado)
   */
  update(newValue: number): Odds {
    return new Odds(newValue);
  }

  toString(): string {
    return this.value.toFixed(2);
  }

  toJSON(): Record<string, any> {
    return { value: this.value };
  }
}
