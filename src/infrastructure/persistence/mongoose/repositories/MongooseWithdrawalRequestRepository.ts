import { WithdrawalRequest } from '@/core/finance/domain/entities/WithdrawalRequest';
import {
  IWithdrawalRequestRepository,
  WithdrawalRequestRepositoryOptions,
} from '@/core/finance/domain/repositories/IWithdrawalRequestRepository';
import {
  IWithdrawalRequestDocument,
  WithdrawalRequestModel,
} from '../schemas/WithdrawalRequestSchema';
import { AppError } from '@/shared/errors/AppError';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import {
  withdrawalConcurrencyConflictCounter,
} from '@/infrastructure/observability/metrics';

export class MongooseWithdrawalRequestRepository implements IWithdrawalRequestRepository {
  private toDomain(doc: IWithdrawalRequestDocument): WithdrawalRequest {
    return new WithdrawalRequest(
      doc.requestId,
      doc.userId,
      doc.amountCents / 100,
      doc.currency,
      doc.requestedAt,
      doc.status,
      doc.processedAt,
      doc.notes,
      doc.approvalLogs,
      doc.processingAt,
      doc.version ?? 1,
    );
  }

  async create(
    request: WithdrawalRequest,
    options: WithdrawalRequestRepositoryOptions = {},
  ): Promise<WithdrawalRequest> {
    const created = await WithdrawalRequestModel.create(
      [
        {
          requestId: request.id,
          userId: request.userId,
          amountCents: Math.round(request.amount * 100),
          currency: request.currency,
          status: request.status,
          requestedAt: request.requestedAt,
          processedAt: request.processedAt,
          processingAt: request.processingAt,
          notes: request.notes,
          approvalLogs: request.approvalLogs,
          version: request.version ?? 1,
        },
      ],
      { session: options.session as never },
    );
    const doc = (Array.isArray(created) ? created[0] : created) as unknown as IWithdrawalRequestDocument;

    return this.toDomain(doc);
  }

  async withTransaction<T>(work: (session: unknown) => Promise<T>): Promise<T> {
    const session = await WithdrawalRequestModel.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } finally {
      await session.endSession();
    }
  }

  async update(
    request: WithdrawalRequest,
    options?: WithdrawalRequestRepositoryOptions,
  ): Promise<WithdrawalRequest> {
    const filter: Record<string, unknown> = { requestId: request.id };
    if (options?.guard) {
      filter.status = options.guard.status;
      if (typeof options.guard.version === 'number') {
        filter.version = options.guard.version;
      }
    }

    const query = WithdrawalRequestModel.findOneAndUpdate(
      filter,
      {
        $set: {
          status: request.status,
          processedAt: request.processedAt,
          processingAt: request.processingAt,
          approvalLogs: request.approvalLogs,
        },
        $inc: { version: 1 },
      },
      { new: true },
    );
    if (options?.session) {
      query.session(options.session as never);
    }
    const updated = await query.lean<IWithdrawalRequestDocument>();

    if (!updated) {
      if (options?.guard) {
        this.recordConflict(request.id, options.guard.status);
        throw new AppError(
          'CONFLICT',
          'Withdrawal request changed concurrently',
          409,
          { requestId: request.id },
        );
      }
      throw new Error('Withdrawal request could not be updated');
    }

    return this.toDomain(updated as IWithdrawalRequestDocument);
  }

  async claimForProcessing(
    requestId: string,
    options?: { session?: unknown },
  ): Promise<WithdrawalRequest | null> {
    const query = WithdrawalRequestModel.findOneAndUpdate(
      { requestId, status: { $in: ['APPROVED', 'FAILED'] } },
      {
        $set: { status: 'PROCESSING', processingAt: new Date() },
        $inc: { version: 1 },
      },
      { new: true },
    );
    if (options?.session) {
      query.session(options.session as never);
    }
    const updated = await query.lean<IWithdrawalRequestDocument>();

    if (!updated) {
      this.recordConflict(requestId, 'APPROVED');
      return null;
    }

    return this.toDomain(updated as IWithdrawalRequestDocument);
  }

  private recordConflict(requestId: string, expectedStatus: string): void {
    try {
      withdrawalConcurrencyConflictCounter.inc();
    } catch (error) {
      console.debug('withdrawalConcurrencyConflictCounter inc failed', error);
    }
    writeStructuredLog({
      event: 'withdrawal_concurrency_conflict',
      requestId,
      expectedStatus,
    });
  }

  async findById(id: string): Promise<WithdrawalRequest | null> {
    const doc = await WithdrawalRequestModel.findOne({
      requestId: id,
    }).lean<IWithdrawalRequestDocument>();
    if (!doc) {
      return null;
    }
    return this.toDomain(doc as IWithdrawalRequestDocument);
  }

  async findByUserId(userId: string): Promise<WithdrawalRequest[]> {
    const docs = await WithdrawalRequestModel.find({ userId })
      .sort({ requestedAt: -1 })
      .lean<IWithdrawalRequestDocument[]>();
    return docs.map((doc) => this.toDomain(doc as IWithdrawalRequestDocument));
  }

  async listPending(limit?: number, offset?: number): Promise<WithdrawalRequest[]> {
    const docs = await WithdrawalRequestModel.find({
      status: { $in: ['REQUESTED', 'VALIDATING'] },
    })
      .sort({ requestedAt: -1 })
      .skip(offset || 0)
      .limit(limit || 20)
      .lean<IWithdrawalRequestDocument[]>();
    return docs.map((doc) => this.toDomain(doc as IWithdrawalRequestDocument));
  }

  async listStuckProcessing(processingBefore: Date, limit?: number): Promise<WithdrawalRequest[]> {
    const docs = await WithdrawalRequestModel.find({
      status: 'PROCESSING',
      processingAt: { $lt: processingBefore },
    })
      .sort({ processingAt: 1 })
      .limit(limit || 20)
      .lean<IWithdrawalRequestDocument[]>();
    return docs.map((doc) => this.toDomain(doc as IWithdrawalRequestDocument));
  }

  async listStuckApproved(approvedBefore: Date, limit?: number): Promise<WithdrawalRequest[]> {
    const docs = await WithdrawalRequestModel.find({
      status: 'APPROVED',
      processingAt: { $exists: false },
      processedAt: { $lt: approvedBefore },
    })
      .sort({ processedAt: 1 })
      .limit(limit || 20)
      .lean<IWithdrawalRequestDocument[]>();
    return docs.map((doc) => this.toDomain(doc as IWithdrawalRequestDocument));
  }
}
