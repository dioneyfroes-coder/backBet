import { AuditEvent } from '../entities/AuditEvent';
import {
  AuditEventQueryOptions,
  AuditEventQueryResult,
  IAuditEventRepository,
} from './IAuditEventRepository';

export class InMemoryAuditEventRepository implements IAuditEventRepository {
  private readonly records: Map<string, AuditEvent> = new Map();

  async append(event: AuditEvent): Promise<AuditEvent> {
    this.records.set(event.eventId, event);
    return event;
  }

  async findById(eventId: string): Promise<AuditEvent | null> {
    return this.records.get(eventId) || null;
  }

  async query(options: AuditEventQueryOptions = {}): Promise<AuditEventQueryResult> {
    let events = Array.from(this.records.values());

    if (options.type) {
      events = events.filter((e) => e.type === options.type);
    }
    if (options.actorUserId) {
      events = events.filter((e) => e.actorUserId === options.actorUserId);
    }
    if (options.resourceType) {
      events = events.filter((e) => e.resourceType === options.resourceType);
    }
    if (options.from) {
      events = events.filter((e) => e.createdAt.getTime() >= (options.from as Date).getTime());
    }
    if (options.to) {
      events = events.filter((e) => e.createdAt.getTime() <= (options.to as Date).getTime());
    }

    events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = events.length;
    const limit = options.limit && options.limit > 0 ? options.limit : 50;
    const offset = options.offset && options.offset > 0 ? options.offset : 0;
    return { events: events.slice(offset, offset + limit), total };
  }

  async deleteOlderThan(threshold: Date): Promise<number> {
    const thresholdMs = threshold.getTime();
    let deleted = 0;
    for (const [key, event] of this.records) {
      if (event.createdAt.getTime() < thresholdMs) {
        this.records.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  clear(): void {
    this.records.clear();
  }

  get size(): number {
    return this.records.size;
  }
}
