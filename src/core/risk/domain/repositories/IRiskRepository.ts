import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { TransactionSession } from '@/core/shared/types/Transaction';

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
}
