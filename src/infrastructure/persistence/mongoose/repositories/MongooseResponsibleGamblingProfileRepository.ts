import { ResponsibleGamblingProfile } from '@/core/responsibleGambling/domain/entities/ResponsibleGamblingProfile';
import { IResponsibleGamblingRepository } from '@/core/responsibleGambling/domain/repositories/IResponsibleGamblingRepository';
import {
  IResponsibleGamblingProfileDocument,
  ResponsibleGamblingProfileModel,
} from '../schemas/ResponsibleGamblingProfileSchema';

export class MongooseResponsibleGamblingProfileRepository
  implements IResponsibleGamblingRepository
{
  private toDomain(doc: IResponsibleGamblingProfileDocument): ResponsibleGamblingProfile {
    return new ResponsibleGamblingProfile(
      doc.userId,
      doc.selfExcluded,
      doc.selfExclusionUntil ?? null,
      doc.timeOutUntil ?? null,
      doc.depositLimit ?? null,
      doc.betLimit ?? null,
      doc.depositPeriodStart,
      doc.depositUsedCents,
      doc.betPeriodStart,
      doc.betUsedCents,
      doc.updatedAt,
    );
  }

  async findById(id: string): Promise<ResponsibleGamblingProfile | null> {
    return this.findByUserId(id);
  }

  async findByUserId(userId: string): Promise<ResponsibleGamblingProfile | null> {
    const doc = await ResponsibleGamblingProfileModel.findOne({
      userId,
    }).lean<IResponsibleGamblingProfileDocument>();
    if (!doc) {
      return null;
    }
    return this.toDomain(doc as IResponsibleGamblingProfileDocument);
  }

  async save(profile: ResponsibleGamblingProfile): Promise<void> {
    await ResponsibleGamblingProfileModel.updateOne(
      { userId: profile.userId },
      {
        userId: profile.userId,
        selfExcluded: profile.selfExcluded,
        selfExclusionUntil: profile.selfExclusionUntil,
        timeOutUntil: profile.timeOutUntil,
        depositLimit: profile.depositLimit,
        betLimit: profile.betLimit,
        depositPeriodStart: profile.depositPeriodStart,
        depositUsedCents: profile.depositUsedCents,
        betPeriodStart: profile.betPeriodStart,
        betUsedCents: profile.betUsedCents,
        updatedAt: profile.updatedAt,
      },
      { upsert: true },
    );
  }

  async update(profile: ResponsibleGamblingProfile): Promise<void> {
    const updated = await ResponsibleGamblingProfileModel.findOneAndUpdate(
      { userId: profile.userId },
      {
        selfExcluded: profile.selfExcluded,
        selfExclusionUntil: profile.selfExclusionUntil,
        timeOutUntil: profile.timeOutUntil,
        depositLimit: profile.depositLimit,
        betLimit: profile.betLimit,
        depositPeriodStart: profile.depositPeriodStart,
        depositUsedCents: profile.depositUsedCents,
        betPeriodStart: profile.betPeriodStart,
        betUsedCents: profile.betUsedCents,
        updatedAt: profile.updatedAt,
      },
      { new: true },
    ).lean<IResponsibleGamblingProfileDocument>();

    if (!updated) {
      throw new Error('Responsible gambling profile could not be updated');
    }
  }
}