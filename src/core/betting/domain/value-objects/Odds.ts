export class Odds {
  constructor(public readonly value: number) {
    this.validate();
  }

  private validate(): void {
    if (!this.value || typeof this.value !== 'number') {
      throw new Error('Invalid odds value');
    }

    if (this.value <= 1) {
      throw new Error('Odds must be greater than 1');
    }

    if (this.value > 1000) {
      throw new Error('Odds cannot be greater than 1000');
    }
  }

  calculatePotentialReturn(stake: number): number {
    return this.value * stake;
  }

  toString(): string {
    return this.value.toFixed(2);
  }
}