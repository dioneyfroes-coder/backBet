import { SigapSubmission } from '@/core/sigap/domain/entities/SigapSubmission';
import {
  ISigapSubmissionRepository,
  SigapSubmissionQueryOptions,
  SigapSubmissionQueryResult,
} from '@/core/sigap/domain/repositories/ISigapSubmissionRepository';
import { ISigapSubmissionDocument, SigapSubmissionModel } from '../schemas/SigapSubmissionSchema';

export class MongooseSigapSubmissionRepository implements ISigapSubmissionRepository {
  private toDomain(doc: ISigapSubmissionDocument): SigapSubmission {
    return new SigapSubmission(
      doc.submissionId,
      doc.operatorId,
      doc.fileType,
      doc.referenceDate,
      doc.status,
      doc.provider,
      doc.attemptCount,
      doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt),
      doc.updatedAt instanceof Date ? doc.updatedAt : new Date(doc.updatedAt),
      doc.payloadSummary ?? undefined,
      doc.ackId ?? undefined,
      doc.errorCode ?? undefined,
      doc.errorMessage ?? undefined,
      doc.submittedAt,
    );
  }

  async save(submission: SigapSubmission): Promise<SigapSubmission> {
    await SigapSubmissionModel.updateOne(
      { submissionId: submission.id },
      {
        submissionId: submission.id,
        operatorId: submission.operatorId,
        fileType: submission.fileType,
        referenceDate: submission.referenceDate,
        status: submission.status,
        provider: submission.provider,
        attemptCount: submission.attemptCount,
        payloadSummary: submission.payloadSummary ?? null,
        ackId: submission.ackId ?? null,
        errorCode: submission.errorCode ?? null,
        errorMessage: submission.errorMessage ?? null,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
        submittedAt: submission.submittedAt ?? null,
      },
      { upsert: true },
    );
    return submission;
  }

  async findById(id: string): Promise<SigapSubmission | null> {
    const doc = await SigapSubmissionModel.findOne({ submissionId: id }).lean<ISigapSubmissionDocument>();
    if (!doc) {
      return null;
    }
    return this.toDomain(doc as ISigapSubmissionDocument);
  }

  async findByKey(
    operatorId: string,
    fileType: SigapSubmission['fileType'],
    referenceDate: string,
  ): Promise<SigapSubmission | null> {
    const doc = await SigapSubmissionModel.findOne({ operatorId, fileType, referenceDate }).lean<ISigapSubmissionDocument>();
    if (!doc) {
      return null;
    }
    return this.toDomain(doc as ISigapSubmissionDocument);
  }

  async query(options: SigapSubmissionQueryOptions = {}): Promise<SigapSubmissionQueryResult> {
    const filter: Record<string, unknown> = {};
    if (options.fileType) {
      filter.fileType = options.fileType;
    }
    if (options.status) {
      filter.status = options.status;
    }
    if (options.operatorId) {
      filter.operatorId = options.operatorId;
    }
    if (options.referenceDate) {
      filter.referenceDate = options.referenceDate;
    }

    const limit = options.limit && options.limit > 0 ? options.limit : 50;
    const offset = options.offset && options.offset > 0 ? options.offset : 0;

    const docs = await SigapSubmissionModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .lean<ISigapSubmissionDocument[]>();

    const total = await SigapSubmissionModel.countDocuments(filter);
    return {
      items: docs.map((doc) => this.toDomain(doc as ISigapSubmissionDocument)),
      total,
    };
  }
}
