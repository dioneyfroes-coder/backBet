import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';

export interface IRiskRepository {
  getByUserId(userId: string): Promise<RiskProfile | null>;
  upsert(profile: RiskProfile): Promise<void>;
  increaseExposure(userId: string, amount: number): Promise<void>;
  decreaseExposure(userId: string, amount: number): Promise<void>;
  getExposure(userId: string): Promise<number>;
}
