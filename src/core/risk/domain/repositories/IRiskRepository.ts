import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { TransactionSession } from '@/core/shared/types/Transaction';
import { RiskExposureScope } from '@/core/risk/types/risk.types';
import { RiskExposureCounter } from '@/core/risk/domain/entities/RiskExposureCounter';

export type RiskRepositoryOptions = { session?: TransactionSession };

export interface IRiskRepository {
  getByUserId(userId: string): Promise<RiskProfile | null>;
  upsert(profile: RiskProfile, options?: RiskRepositoryOptions): Promise<void>;
  increaseExposure(userId: string, amount: number, options?: RiskRepositoryOptions): Promise<void>;
  decreaseExposure(userId: string, amount: number, options?: RiskRepositoryOptions): Promise<void>;
  getExposure(userId: string, options?: RiskRepositoryOptions): Promise<number>;
  /**
   * Atomically reserves additional exposure for a user.
   * Only succeeds if exposure + amount <= maxExposure; otherwise returns false
   * and leaves exposure unchanged. This is the authoritative concurrency-safe
   * guard used on the critical path when placing a bet.
   */
  reserveExposure(userId: string, amount: number, options?: RiskRepositoryOptions): Promise<boolean>;
  /**
   * Atomically reserves exposure on a shared counter (event/market).
   * Returns false if exposure + amount would exceed the counter's limit, in
   * which case nothing is changed.
   */
  reserveCounter(
    scope: RiskExposureScope,
    refId: string,
    amount: number,
    options?: RiskRepositoryOptions,
  ): Promise<boolean>;
  decreaseCounter(
    scope: RiskExposureScope,
    refId: string,
    amount: number,
    options?: RiskRepositoryOptions,
  ): Promise<void>;
  getCounter(
    scope: RiskExposureScope,
    refId: string,
    options?: RiskRepositoryOptions,
  ): Promise<RiskExposureCounter | null>;
  /** Overwrites a counter's exposure (used by the reconciliation job). */
  setCounterExposure(
    scope: RiskExposureScope,
    refId: string,
    exposureCents: number,
    options?: RiskRepositoryOptions,
  ): Promise<void>;
}
