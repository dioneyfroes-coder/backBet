import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';

export class InMemoryRiskRepository implements IRiskRepository {
  private store: Map<string, RiskProfile> = new Map();

  async getByUserId(userId: string): Promise<RiskProfile | null> {
    const p = this.store.get(userId) ?? null;
    return p ? new RiskProfile(p.userId, p.exposure, p.maxExposure) : null;
  }

  async upsert(profile: RiskProfile): Promise<void> {
    this.store.set(profile.userId, new RiskProfile(profile.userId, profile.exposure, profile.maxExposure));
  }

  async increaseExposure(userId: string, amount: number): Promise<void> {
    const existing = this.store.get(userId) ?? new RiskProfile(userId, 0, 0);
    existing.exposure = Number((existing.exposure + amount).toFixed(2));
    this.store.set(userId, existing);
  }

  async decreaseExposure(userId: string, amount: number): Promise<void> {
    const existing = this.store.get(userId) ?? new RiskProfile(userId, 0, 0);
    existing.exposure = Number((existing.exposure - Math.abs(amount)).toFixed(2));
    if (existing.exposure < 0) existing.exposure = 0;
    this.store.set(userId, existing);
  }

  async getExposure(userId: string): Promise<number> {
    const existing = this.store.get(userId);
    return existing ? existing.exposure : 0;
  }
}
