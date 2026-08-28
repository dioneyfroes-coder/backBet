import { AuditEvent, AuditEventType, AuditSeverity } from '../entities/AuditEvent';

export interface AuditEventQueryOptions {
  limit?: number;
  offset?: number;
  type?: AuditEventType;
  actorUserId?: string;
  resourceType?: string;
  from?: Date;
  to?: Date;
}

export interface AuditEventQueryResult {
  events: AuditEvent[];
  total: number;
}

export interface IAuditEventRepository {
  append(event: AuditEvent): Promise<AuditEvent>;
  findById(eventId: string): Promise<AuditEvent | null>;
  query(options?: AuditEventQueryOptions): Promise<AuditEventQueryResult>;
  deleteOlderThan(threshold: Date): Promise<number>;
}
