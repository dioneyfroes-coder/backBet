import { IdentityVerification } from '../entities/IdentityVerification';
import { IIdentityVerificationRepository } from './IIdentityVerificationRepository';

export class IdentityVerificationRepository implements IIdentityVerificationRepository {
  private readonly records: Map<string, IdentityVerification> = new Map();
  private readonly userIndex: Map<string, string> = new Map();

  async findById(id: string): Promise<IdentityVerification | null> {
    return this.records.get(id) || null;
  }

  async findByUserId(userId: string): Promise<IdentityVerification | null> {
    const id = this.userIndex.get(userId);
    if (!id) {
      return null;
    }
    return this.records.get(id) || null;
  }

  async save(verification: IdentityVerification): Promise<void> {
    this.records.set(verification.id, verification);
    this.userIndex.set(verification.userId, verification.id);
  }

  async update(verification: IdentityVerification): Promise<void> {
    if (!this.records.has(verification.id)) {
      throw new (await import('@shared/errors/AppError')).AppError(
        'NOT_FOUND',
        'Identity verification not found',
        404,
      );
    }
    this.records.set(verification.id, verification);
    this.userIndex.set(verification.userId, verification.id);
  }

  clear(): void {
    this.records.clear();
    this.userIndex.clear();
  }
}