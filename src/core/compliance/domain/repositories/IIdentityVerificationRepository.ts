import { IdentityVerification } from '../entities/IdentityVerification';

export interface IIdentityVerificationRepository {
  findById(id: string): Promise<IdentityVerification | null>;
  findByUserId(userId: string): Promise<IdentityVerification | null>;
  save(verification: IdentityVerification): Promise<void>;
  update(verification: IdentityVerification): Promise<void>;
}