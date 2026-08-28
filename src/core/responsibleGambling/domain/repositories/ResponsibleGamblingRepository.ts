import { ResponsibleGamblingProfile } from '../entities/ResponsibleGamblingProfile';
import { IResponsibleGamblingRepository } from './IResponsibleGamblingRepository';

export class ResponsibleGamblingRepository implements IResponsibleGamblingRepository {
  private readonly records: Map<string, ResponsibleGamblingProfile> = new Map();
  private readonly userIndex: Map<string, string> = new Map();

  async findById(id: string): Promise<ResponsibleGamblingProfile | null> {
    return this.records.get(id) || null;
  }

  async findByUserId(userId: string): Promise<ResponsibleGamblingProfile | null> {
    const id = this.userIndex.get(userId);
    if (!id) {
      return null;
    }
    return this.records.get(id) || null;
  }

  async save(profile: ResponsibleGamblingProfile): Promise<void> {
    this.records.set(profile.userId, profile);
    this.userIndex.set(profile.userId, profile.userId);
  }

  async update(profile: ResponsibleGamblingProfile): Promise<void> {
    if (!this.records.has(profile.userId)) {
      throw new (await import('@shared/errors/AppError')).AppError(
        'NOT_FOUND',
        'Responsible gambling profile not found',
        404,
      );
    }
    this.records.set(profile.userId, profile);
    this.userIndex.set(profile.userId, profile.userId);
  }

  clear(): void {
    this.records.clear();
    this.userIndex.clear();
  }
}