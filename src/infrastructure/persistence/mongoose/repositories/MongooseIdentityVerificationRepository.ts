import { IdentityVerification } from '@/core/compliance/domain/entities/IdentityVerification';
import { IIdentityVerificationRepository } from '@/core/compliance/domain/repositories/IIdentityVerificationRepository';
import {
  IIdentityVerificationDocument,
  IdentityVerificationModel,
} from '../schemas/IdentityVerificationSchema';

export class MongooseIdentityVerificationRepository implements IIdentityVerificationRepository {
  private toDomain(doc: IIdentityVerificationDocument): IdentityVerification {
    return new IdentityVerification(
      doc.verificationId,
      doc.userId,
      doc.status,
      doc.provider,
      doc.providerReference,
      doc.attempts,
      doc.createdAt,
      doc.updatedAt,
      doc.verifiedAt ?? null,
      doc.rejectedReason ?? null,
    );
  }

  async findById(id: string): Promise<IdentityVerification | null> {
    const doc = await IdentityVerificationModel.findOne({
      verificationId: id,
    }).lean<IIdentityVerificationDocument>();
    if (!doc) {
      return null;
    }
    return this.toDomain(doc as IIdentityVerificationDocument);
  }

  async findByUserId(userId: string): Promise<IdentityVerification | null> {
    const doc = await IdentityVerificationModel.findOne({
      userId,
    }).lean<IIdentityVerificationDocument>();
    if (!doc) {
      return null;
    }
    return this.toDomain(doc as IIdentityVerificationDocument);
  }

  async save(verification: IdentityVerification): Promise<void> {
    await IdentityVerificationModel.updateOne(
      { verificationId: verification.id },
      {
        verificationId: verification.id,
        userId: verification.userId,
        status: verification.status,
        provider: verification.provider,
        providerReference: verification.providerReference,
        attempts: verification.attempts,
        createdAt: verification.createdAt,
        updatedAt: verification.updatedAt,
        verifiedAt: verification.verifiedAt,
        rejectedReason: verification.rejectedReason,
      },
      { upsert: true },
    );
  }

  async update(verification: IdentityVerification): Promise<void> {
    const updated = await IdentityVerificationModel.findOneAndUpdate(
      { verificationId: verification.id },
      {
        status: verification.status,
        providerReference: verification.providerReference,
        attempts: verification.attempts,
        updatedAt: verification.updatedAt,
        verifiedAt: verification.verifiedAt,
        rejectedReason: verification.rejectedReason,
      },
      { new: true },
    ).lean<IIdentityVerificationDocument>();

    if (!updated) {
      throw new Error('Identity verification could not be updated');
    }
  }
}