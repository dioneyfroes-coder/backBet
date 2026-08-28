import { AuditEvent } from '@/core/audit/domain/entities/AuditEvent';
import {
  AuditEventQueryOptions,
  AuditEventQueryResult,
  IAuditEventRepository,
} from '@/core/audit/domain/repositories/IAuditEventRepository';
import { IAuditEventDocument, AuditEventModel } from '../schemas/AuditEventSchema';

export class MongooseAuditEventRepository implements IAuditEventRepository {
  private toDomain(doc: IAuditEventDocument): AuditEvent {
    return new AuditEvent(
      doc.eventId,
      doc.type,
      doc.action,
      doc.actorUserId,
      doc.actorRole,
      doc.resourceType,
      doc.resourceId ?? undefined,
      doc.before ?? undefined,
      doc.after ?? undefined,
      doc.reason ?? undefined,
      doc.ip ?? undefined,
      doc.requestId ?? undefined,
      doc.severity,
      doc.metadata ?? {},
      doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt),
    );
  }

  async append(event: AuditEvent): Promise<AuditEvent> {
    await AuditEventModel.updateOne(
      { eventId: event.eventId },
      {
        eventId: event.eventId,
        type: event.type,
        action: event.action,
        actorUserId: event.actorUserId,
        actorRole: event.actorRole,
        resourceType: event.resourceType,
        resourceId: event.resourceId ?? null,
        before: event.before ?? null,
        after: event.after ?? null,
        reason: event.reason ?? null,
        ip: event.ip ?? null,
        requestId: event.requestId ?? null,
        severity: event.severity,
        metadata: event.metadata ?? {},
        createdAt: event.createdAt,
      },
      { upsert: true },
    );
    return event;
  }

  async findById(eventId: string): Promise<AuditEvent | null> {
    const doc = await AuditEventModel.findOne({ eventId }).lean<IAuditEventDocument>();
    if (!doc) {
      return null;
    }
    return this.toDomain(doc as IAuditEventDocument);
  }

  async query(options: AuditEventQueryOptions = {}): Promise<AuditEventQueryResult> {
    const filter: Record<string, unknown> = {};
    if (options.type) {
      filter.type = options.type;
    }
    if (options.actorUserId) {
      filter.actorUserId = options.actorUserId;
    }
    if (options.resourceType) {
      filter.resourceType = options.resourceType;
    }
    if (options.from || options.to) {
      const createdAtFilter: Record<string, unknown> = {};
      if (options.from) {
        createdAtFilter.$gte = options.from;
      }
      if (options.to) {
        createdAtFilter.$lte = options.to;
      }
      filter.createdAt = createdAtFilter;
    }

    const limit = options.limit && options.limit > 0 ? options.limit : 50;
    const offset = options.offset && options.offset > 0 ? options.offset : 0;

    const docs = await AuditEventModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .lean<IAuditEventDocument[]>();

    const total = await AuditEventModel.countDocuments(filter);
    return {
      events: docs.map((doc) => this.toDomain(doc as IAuditEventDocument)),
      total,
    };
  }

  async deleteOlderThan(threshold: Date): Promise<number> {
    const result = await AuditEventModel.deleteMany({ createdAt: { $lt: threshold } });
    return result.deletedCount ?? 0;
  }
}
