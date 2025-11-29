export class RiskProfile {
  constructor(
    public readonly userId: string,
    // current exposure tracked for the user
    public exposure: number = 0,
    // configured max exposure allowed for this user
    public maxExposure: number = 0,
  ) {}

  increaseExposure(amount: number): void {
    this.exposure += amount;
  }

  decreaseExposure(amount: number): void {
    this.exposure = Math.max(0, this.exposure - amount);
  }

  isOverLimit(): boolean {
    return this.exposure > this.maxExposure;
  }
}
