import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';

export class InMemoryRiskRepository implements IRiskRepository {
  private store: Map<string, RiskProfile> = new Map();

  async getByUserId(userId: string): Promise<RiskProfile | null> {
    const p = this.store.get(userId) ?? null;
    if (!p) return null;
    return new RiskProfile(p.userId, p.exposureCents, p.maxExposureCents, p.currency);
  }

  async upsert(profile: RiskProfile): Promise<void> {
    this.store.set(
      profile.userId,
      new RiskProfile(profile.userId, profile.exposureCents, profile.maxExposureCents, profile.currency),
    );
  }

  async increaseExposure(userId: string, amountCents: number): Promise<void> {
    const existing = this.store.get(userId) ?? new RiskProfile(userId, 0, 0);
    existing.increaseExposure(amountCents);
    this.store.set(userId, existing);
  }

  async decreaseExposure(userId: string, amountCents: number): Promise<void> {
    const existing = this.store.get(userId) ?? new RiskProfile(userId, 0, 0);
    existing.decreaseExposure(amountCents);
    this.store.set(userId, existing);
  }

  async getExposure(userId: string): Promise<number> {
    const existing = this.store.get(userId);
    return existing ? existing.exposure : 0;
  }
}
