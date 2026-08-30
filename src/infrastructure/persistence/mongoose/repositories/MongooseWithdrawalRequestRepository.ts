import { WithdrawalRequest } from '@/core/finance/domain/entities/WithdrawalRequest';
import {
  IWithdrawalRequestRepository,
  WithdrawalRequestRepositoryOptions,
} from '@/core/finance/domain/repositories/IWithdrawalRequestRepository';
import {
  IWithdrawalRequestDocument,
  WithdrawalRequestModel,
} from '../schemas/WithdrawalRequestSchema';

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
    );
  }

  async create(
    request: WithdrawalRequest,
    options: WithdrawalRequestRepositoryOptions = {},
  ): Promise<WithdrawalRequest> {
    const created = await WithdrawalRequestModel.create(
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
      },
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

  async update(request: WithdrawalRequest): Promise<WithdrawalRequest> {
    const updated = await WithdrawalRequestModel.findOneAndUpdate(
      { requestId: request.id },
      {
        status: request.status,
        processedAt: request.processedAt,
        processingAt: request.processingAt,
        approvalLogs: request.approvalLogs,
      },
      { new: true },
    ).lean<IWithdrawalRequestDocument>();

    if (!updated) {
      throw new Error('Withdrawal request could not be updated');
    }

    return this.toDomain(updated as IWithdrawalRequestDocument);
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
}
