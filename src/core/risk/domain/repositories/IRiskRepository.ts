import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { TransactionSession } from '@/core/shared/types/Transaction';

export type RiskRepositoryOptions = { session?: TransactionSession };

export interface IRiskRepository {
  getByUserId(userId: string): Promise<RiskProfile | null>;
  upsert(profile: RiskProfile, options?: RiskRepositoryOptions): Promise<void>;
  increaseExposure(userId: string, amount: number, options?: RiskRepositoryOptions): Promise<void>;
  decreaseExposure(userId: string, amount: number, options?: RiskRepositoryOptions): Promise<void>;
  getExposure(userId: string, options?: RiskRepositoryOptions): Promise<number>;
}
