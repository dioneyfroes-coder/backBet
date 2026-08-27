import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { RiskExposureCounter } from '@/core/risk/domain/entities/RiskExposureCounter';
import { RiskExposureScope } from '@/core/risk/types/risk.types';
import { RISK_CONFIG } from '@/core/risk/config/risk-config';

const counterKey = (scope: RiskExposureScope, refId: string): string => `${scope}:${refId}`;

export class InMemoryRiskRepository implements IRiskRepository {
  private store: Map<string, RiskProfile> = new Map();
  private counters: Map<string, RiskExposureCounter> = new Map();

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

  async reserveExposure(userId: string, amountCents: number): Promise<boolean> {
    const existing =
      this.store.get(userId) ??
      new RiskProfile(userId, 0, RISK_CONFIG.MAX_EXPOSURE_PER_USER * 100);
    if (existing.exposureCents + amountCents > existing.maxExposureCents) return false;
    existing.increaseExposure(amountCents);
    this.store.set(userId, existing);
    return true;
  }

  private counterDefaultMax(scope: RiskExposureScope): number {
    return (scope === 'EVENT'
      ? RISK_CONFIG.MAX_EXPOSURE_PER_EVENT
      : RISK_CONFIG.MAX_EXPOSURE_PER_MARKET) * 100;
  }

  async getCounter(
    scope: RiskExposureScope,
    refId: string,
  ): Promise<RiskExposureCounter | null> {
    const c = this.counters.get(counterKey(scope, refId));
    if (!c) return null;
    return new RiskExposureCounter(c.scope, c.refId, c.exposureCents, c.maxExposureCents, c.currency);
  }

  async reserveCounter(
    scope: RiskExposureScope,
    refId: string,
    amountCents: number,
  ): Promise<boolean> {
    const existing =
      this.counters.get(counterKey(scope, refId)) ??
      new RiskExposureCounter(scope, refId, 0, this.counterDefaultMax(scope));
    if (existing.exposureCents + amountCents > existing.maxExposureCents) return false;
    existing.increaseExposure(amountCents);
    this.counters.set(counterKey(scope, refId), existing);
    return true;
  }

  async decreaseCounter(
    scope: RiskExposureScope,
    refId: string,
    amountCents: number,
  ): Promise<void> {
    const existing = this.counters.get(counterKey(scope, refId));
    if (!existing) return;
    existing.decreaseExposure(amountCents);
    this.counters.set(counterKey(scope, refId), existing);
  }

  async setCounterExposure(
    scope: RiskExposureScope,
    refId: string,
    exposureCents: number,
  ): Promise<void> {
    const existing =
      this.counters.get(counterKey(scope, refId)) ??
      new RiskExposureCounter(scope, refId, 0, this.counterDefaultMax(scope));
    const counter = new RiskExposureCounter(
      scope,
      refId,
      exposureCents,
      existing.maxExposureCents,
      existing.currency,
    );
    this.counters.set(counterKey(scope, refId), counter);
  }
}
