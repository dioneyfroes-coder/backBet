import { RISK_CONFIG } from '@/core/risk/config/risk-config';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { IBetRepository } from '@/core/betting/domain/repositories/IBetRepository';
import { BetStatus } from '@/core/betting/types/bet.types';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { RiskRepositoryOptions } from '../repositories/IRiskRepository';

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
    // If we have a BetRepository we compute exposure using unsettled bets (PENDING)
    if (this.betRepository) {
      const bets = await this.betRepository.findByUserId(userId);
      const pending = bets.filter((b) => b.status === 'PENDING');
      const sumLiability = pending.reduce((acc, b) => {
        // liability = stake * (odds - 1)
        const liability = Number((b.amount.value * (b.odds.value - 1)).toFixed(2));
        return acc + liability;
      }, 0);
      // Also include stored exposure if repository available
      if (this.riskRepository) {
        const profile = await this.riskRepository.getByUserId(userId);
        return sumLiability + (profile?.exposure ?? 0);
      }
      return sumLiability;
    }

    if (this.riskRepository) {
      const profile = await this.riskRepository.getByUserId(userId);
      return profile?.exposure ?? 0;
    }

    const p = this.profiles.get(userId);
    return p?.exposure ?? 0;
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

    const liability = Number((stake * (oddsValue - 1)).toFixed(2));

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

      // per-event and per-market exposure checks
      if (eventId) {
        const pendingSameEvent = bets.filter(
          (b) => b.status === 'PENDING' && b.eventId === eventId,
        );
        const exposureSameEvent = pendingSameEvent.reduce(
          (acc, b) => acc + Number((b.amount.value * (b.odds.value - 1)).toFixed(2)),
          0,
        );
        if (exposureSameEvent + liability > RISK_CONFIG.MAX_EXPOSURE_PER_EVENT) {
          writeStructuredLog(
            {
              event: 'risk_reject',
              userId,
              reason: 'event_exposure_limit',
              eventId,
              exposureSameEvent,
              liability,
            },
            'warn',
          );
          return false;
        }
      }

      if (marketId) {
        const pendingSameMarket = bets.filter(
          (b) => b.status === 'PENDING' && b.marketId === marketId,
        );
        const exposureSameMarket = pendingSameMarket.reduce(
          (acc, b) => acc + Number((b.amount.value * (b.odds.value - 1)).toFixed(2)),
          0,
        );
        if (exposureSameMarket + liability > RISK_CONFIG.MAX_EXPOSURE_PER_MARKET) {
          writeStructuredLog(
            {
              event: 'risk_reject',
              userId,
              reason: 'market_exposure_limit',
              marketId,
              exposureSameMarket,
              liability,
            },
            'warn',
          );
          return false;
        }
      }
    }

    if (currentExposure + liability > maxExposure) {
      writeStructuredLog(
        {
          event: 'risk_reject',
          userId,
          reason: 'exceeds_max_exposure',
          currentExposure,
          liability,
          maxExposure,
        },
        'warn',
      );
      return false;
    }

    return true;
  }

  async registerExposure(userId: string, amount: number, options?: RiskRepositoryOptions): Promise<void> {
    if (this.riskRepository) {
      if (options) await this.riskRepository.increaseExposure(userId, amount, options);
      else await this.riskRepository.increaseExposure(userId, amount);
      return;
    }
    const profile =
      this.profiles.get(userId) ?? new RiskProfile(userId, 0, RISK_CONFIG.MAX_EXPOSURE_PER_USER);
    profile.increaseExposure(amount);
    this.profiles.set(userId, profile);
  }

  async reduceExposure(userId: string, amount: number, options?: RiskRepositoryOptions): Promise<void> {
    if (this.riskRepository) {
      if (options) await this.riskRepository.decreaseExposure(userId, amount, options);
      else await this.riskRepository.decreaseExposure(userId, amount);
      return;
    }
    const profile = this.profiles.get(userId);
    if (!profile) return;
    profile.decreaseExposure(amount);
    this.profiles.set(userId, profile);
  }
}
