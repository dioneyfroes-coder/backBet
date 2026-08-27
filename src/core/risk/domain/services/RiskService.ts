import { RISK_CONFIG } from '@/core/risk/config/risk-config';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { RiskExposureCounter } from '@/core/risk/domain/entities/RiskExposureCounter';
import { RiskExposureScope } from '@/core/risk/types/risk.types';
import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { IBetRepository } from '@/core/betting/domain/repositories/IBetRepository';
import { BetStatus } from '@/core/betting/types/bet.types';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { RiskRepositoryOptions } from '../repositories/IRiskRepository';
import { Money, SupportedCurrency } from '@/core/shared/domain/value-objects/Money';

export class RiskService {
  // If repository is provided, use it; otherwise fallback to in-memory map for compatibility/tests
  private profiles: Map<string, RiskProfile> = new Map();

  constructor(
    private riskRepository?: IRiskRepository,
    private betRepository?: IBetRepository,
  ) {}

  getMaxExposure(): number {
    return RISK_CONFIG.MAX_EXPOSURE_PER_USER;
  }

  async getExposureForUser(userId: string): Promise<number> {
    // Operational exposure lives in RiskProfile.exposure (Fase 6 direction). Prefer
    // the stored value whenever a risk repository is present; bet history is only a
    // reconciliation/fallback source, not the authoritative operational state.
    if (this.riskRepository) {
      const profile = await this.riskRepository.getByUserId(userId);
      return profile?.exposure ?? 0;
    }

    if (this.betRepository) {
      const bets = await this.betRepository.findByUserId(userId);
      const pending = bets.filter((b) => b.status === 'PENDING');
      return (
        pending.reduce((acc, b) => acc + b.odds.calculateLiability(b.amount).getCents(), 0) / 100
      );
    }

    const p = this.profiles.get(userId);
    return p?.exposure ?? 0;
  }

  /** Operational (stored) exposure for an event or market, without scanning bets. */
  private async getCounterExposure(scope: RiskExposureScope, refId: string): Promise<number> {
    if (this.riskRepository) {
      const counter = await this.riskRepository.getCounter(scope, refId);
      return (counter?.exposureCents ?? 0) / 100;
    }
    return 0;
  }

  async getEventExposure(eventId: string): Promise<number> {
    return this.getCounterExposure('EVENT', eventId);
  }

  async getMarketExposure(marketId: string): Promise<number> {
    return this.getCounterExposure('MARKET', marketId);
  }

  async canPlaceBet(
    userId: string,
    stake: number,
    oddsValue: number,
    eventId?: string,
    marketId?: string,
  ): Promise<boolean> {
    // Basic checks: single stake limit
    if (stake > RISK_CONFIG.MAX_SINGLE_STAKE) return false;

    const stakeMoney = new Money(stake, 'BRL');
    const liability = stakeMoney.calculateLiability(oddsValue);
    const liabilityCents = liability.getCents();

    const currentExposure = await this.getExposureForUser(userId);

    // whitelist/blacklist
    if (RISK_CONFIG.WHITELIST_USER_IDS.includes(userId)) {
      return true;
    }
    if (RISK_CONFIG.BLACKLIST_USER_IDS.includes(userId)) {
      writeStructuredLog({ event: 'risk_reject', userId, reason: 'blacklist' }, 'warn');
      return false;
    }

    const profile = this.riskRepository ? await this.riskRepository.getByUserId(userId) : undefined;
    const maxExposure = profile?.maxExposure ?? RISK_CONFIG.MAX_EXPOSURE_PER_USER;

    // velocity check: count pending bets in last window
    if (this.betRepository) {
      const bets = await this.betRepository.findByUserId(userId);
      const now = Date.now();
      const windowStart = now - RISK_CONFIG.VELOCITY_WINDOW_SECONDS * 1000;
      const recentPending = bets.filter(
        (b) => b.status === 'PENDING' && b.createdAt.getTime() >= windowStart,
      );
      if (recentPending.length + 1 > RISK_CONFIG.MAX_BETS_PER_WINDOW) {
        writeStructuredLog(
          {
            event: 'risk_reject',
            userId,
            reason: 'velocity_limit',
            count: recentPending.length + 1,
          },
          'warn',
        );
        return false;
      }
    }

    // per-event and per-market exposure pre-checks use the operational (stored)
    // counters, not a re-computation from every bet. The authoritative, atomic
    // enforcement happens on the reservation step inside the place-bet transaction.
    if (eventId) {
      const eventExposure = await this.getEventExposure(eventId);
      if ((eventExposure * 100 + liabilityCents) / 100 > RISK_CONFIG.MAX_EXPOSURE_PER_EVENT) {
        writeStructuredLog(
          {
            event: 'risk_reject',
            userId,
            reason: 'event_exposure_limit',
            eventId,
            exposureSameEvent: eventExposure,
            liability: liability.amount,
          },
          'warn',
        );
        return false;
      }
    }

    if (marketId) {
      const marketExposure = await this.getMarketExposure(marketId);
      if ((marketExposure * 100 + liabilityCents) / 100 > RISK_CONFIG.MAX_EXPOSURE_PER_MARKET) {
        writeStructuredLog(
          {
            event: 'risk_reject',
            userId,
            reason: 'market_exposure_limit',
            marketId,
            exposureSameMarket: marketExposure,
            liability: liability.amount,
          },
          'warn',
        );
        return false;
      }
    }

    if (currentExposure + liability.amount > maxExposure) {
      writeStructuredLog(
        {
          event: 'risk_reject',
          userId,
          reason: 'exceeds_max_exposure',
          currentExposure,
          liability: liability.amount,
          maxExposure,
        },
        'warn',
      );
      return false;
    }

    return true;
  }

  async registerExposure(userId: string, amountCents: number, options?: RiskRepositoryOptions): Promise<void> {
    if (this.riskRepository) {
      if (options) await this.riskRepository.increaseExposure(userId, amountCents, options);
      else await this.riskRepository.increaseExposure(userId, amountCents);
      return;
    }
    const profile =
      this.profiles.get(userId) ?? new RiskProfile(userId, 0, RISK_CONFIG.MAX_EXPOSURE_PER_USER * 100);
    profile.increaseExposure(amountCents);
    this.profiles.set(userId, profile);
  }

  /**
   * Atomically reserves exposure, failing (returning false) if the user's limit
   * would be exceeded. This is the authoritative concurrency-safe guard on the
   * bet placement critical path.
   */
  async reserveExposure(
    userId: string,
    amountCents: number,
    options?: RiskRepositoryOptions,
  ): Promise<boolean> {
    if (this.riskRepository) {
      if (options) return this.riskRepository.reserveExposure(userId, amountCents, options);
      return this.riskRepository.reserveExposure(userId, amountCents);
    }
    const profile =
      this.profiles.get(userId) ?? new RiskProfile(userId, 0, RISK_CONFIG.MAX_EXPOSURE_PER_USER * 100);
    if (profile.exposureCents + amountCents > profile.maxExposureCents) return false;
    profile.increaseExposure(amountCents);
    this.profiles.set(userId, profile);
    return true;
  }

  async reduceExposure(userId: string, amountCents: number, options?: RiskRepositoryOptions): Promise<void> {
    if (this.riskRepository) {
      if (options) await this.riskRepository.decreaseExposure(userId, amountCents, options);
      else await this.riskRepository.decreaseExposure(userId, amountCents);
      return;
    }
    const profile = this.profiles.get(userId);
    if (!profile) return;
    profile.decreaseExposure(amountCents);
    this.profiles.set(userId, profile);
  }

  private async reserveCounter(
    scope: RiskExposureScope,
    refId: string,
    amountCents: number,
    options?: RiskRepositoryOptions,
  ): Promise<boolean> {
    if (this.riskRepository) {
      if (options) return this.riskRepository.reserveCounter(scope, refId, amountCents, options);
      return this.riskRepository.reserveCounter(scope, refId, amountCents);
    }
    return true;
  }

  private async reduceCounter(
    scope: RiskExposureScope,
    refId: string,
    amountCents: number,
    options?: RiskRepositoryOptions,
  ): Promise<void> {
    if (this.riskRepository) {
      if (options) await this.riskRepository.decreaseCounter(scope, refId, amountCents, options);
      else await this.riskRepository.decreaseCounter(scope, refId, amountCents);
    }
  }

  async reserveEventExposure(
    eventId: string,
    amountCents: number,
    options?: RiskRepositoryOptions,
  ): Promise<boolean> {
    return this.reserveCounter('EVENT', eventId, amountCents, options);
  }

  async reserveMarketExposure(
    marketId: string,
    amountCents: number,
    options?: RiskRepositoryOptions,
  ): Promise<boolean> {
    return this.reserveCounter('MARKET', marketId, amountCents, options);
  }

  async reduceEventExposure(
    eventId: string,
    amountCents: number,
    options?: RiskRepositoryOptions,
  ): Promise<void> {
    await this.reduceCounter('EVENT', eventId, amountCents, options);
  }

  async reduceMarketExposure(
    marketId: string,
    amountCents: number,
    options?: RiskRepositoryOptions,
  ): Promise<void> {
    await this.reduceCounter('MARKET', marketId, amountCents, options);
  }

  private liabilityCentsOf(bet: { odds: { calculateLiability(a: Money): Money }; amount: Money }): number {
    return bet.odds.calculateLiability(bet.amount).getCents();
  }

  /**
   * Reconciliation job (admin): recompute a user's operational exposure from the
   * pending bets history and, if diverging, correct RiskProfile.exposure.
   */
  async recalculateUserExposure(
    userId: string,
  ): Promise<{ userId: string; expectedExposureCents: number; actualExposureCents: number; reconciled: boolean }> {
    const bets = this.betRepository ? await this.betRepository.findByUserId(userId) : [];
    const expectedCents = bets
      .filter((b) => b.status === 'PENDING')
      .reduce((acc, b) => acc + this.liabilityCentsOf(b), 0);

    let actualCents = 0;
    if (this.riskRepository) {
      const profile = await this.riskRepository.getByUserId(userId);
      actualCents = profile?.exposureCents ?? 0;
    } else {
      actualCents = this.profiles.get(userId)?.exposureCents ?? 0;
    }

    if (actualCents !== expectedCents) {
      if (this.riskRepository) {
        const profile = await this.riskRepository.getByUserId(userId);
        await this.riskRepository.upsert(
          new RiskProfile(
            userId,
            expectedCents,
            profile?.maxExposureCents ?? RISK_CONFIG.MAX_EXPOSURE_PER_USER * 100,
          ),
        );
      } else {
        const current = this.profiles.get(userId);
        const corrected = new RiskProfile(
          userId,
          expectedCents,
          current?.maxExposureCents ?? RISK_CONFIG.MAX_EXPOSURE_PER_USER * 100,
        );
        this.profiles.set(userId, corrected);
      }
      writeStructuredLog(
        { event: 'risk_exposure_reconciled', userId, fromCents: actualCents, toCents: expectedCents },
        'warn',
      );
    }

    return { userId, expectedExposureCents: expectedCents, actualExposureCents: actualCents, reconciled: actualCents !== expectedCents };
  }

  /**
   * Reconciliation job (admin): recompute a shared event/market exposure counter
   * from ALL pending bets on that scope and, if diverging, correct it.
   */
  async recalculateCounter(
    scope: RiskExposureScope,
    refId: string,
  ): Promise<{ scope: RiskExposureScope; refId: string; expectedExposureCents: number; actualExposureCents: number; reconciled: boolean }> {
    const bets =
      this.betRepository && scope === 'EVENT'
        ? await this.betRepository.findByEventId(refId)
        : this.betRepository
          ? await this.betRepository.findByMarketId(refId)
          : [];
    const expectedCents = bets
      .filter((b) => b.status === 'PENDING')
      .reduce((acc, b) => acc + this.liabilityCentsOf(b), 0);

    const counter = this.riskRepository
      ? await this.riskRepository.getCounter(scope, refId)
      : null;
    const actualCents = counter?.exposureCents ?? 0;

    if (actualCents !== expectedCents) {
      if (this.riskRepository) {
        await this.riskRepository.setCounterExposure(scope, refId, expectedCents);
      }
      writeStructuredLog(
        { event: 'risk_counter_reconciled', scope, refId, fromCents: actualCents, toCents: expectedCents },
        'warn',
      );
    }

    return { scope, refId, expectedExposureCents: expectedCents, actualExposureCents: actualCents, reconciled: actualCents !== expectedCents };
  }

  /**
   * Reconcile a user, plus every event and market that the user has a pending bet
   * on. Convenience entry point for the admin job.
   */
  async reconcileUserRisk(
    userId: string,
  ): Promise<{ user: { expectedExposureCents: number; actualExposureCents: number; reconciled: boolean }; counters: Array<{ scope: RiskExposureScope; refId: string; reconciled: boolean }> }> {
    const bets = this.betRepository ? await this.betRepository.findByUserId(userId) : [];
    const pending = bets.filter((b) => b.status === 'PENDING');

    const user = await this.recalculateUserExposure(userId);

    const touched = new Set<string>();
    for (const bet of pending) {
      touched.add(`EVENT:${bet.eventId}`);
      touched.add(`MARKET:${bet.marketId}`);
    }

    const counters: Array<{ scope: RiskExposureScope; refId: string; reconciled: boolean }> = [];
    for (const key of touched) {
      const [scope, refId] = key.split(':') as [RiskExposureScope, string];
      const res = await this.recalculateCounter(scope, refId);
      counters.push({ scope, refId, reconciled: res.reconciled });
    }
    return { user, counters };
  }
}
