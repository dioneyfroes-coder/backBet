import { ResponsibleGamblingProfile } from '../entities/ResponsibleGamblingProfile';

export interface IResponsibleGamblingRepository {
  findById(id: string): Promise<ResponsibleGamblingProfile | null>;
  findByUserId(userId: string): Promise<ResponsibleGamblingProfile | null>;
  save(profile: ResponsibleGamblingProfile): Promise<void>;
  update(profile: ResponsibleGamblingProfile): Promise<void>;
}