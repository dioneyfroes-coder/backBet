import { UniqueId } from '@/core/shared/domain/value-objects/UniqueId';

/**
 * AuditEvent — registro imutável de auditoria.
 *
 * Representa um evento auditável com os campos "quem / quando / o quê /
 * antes / depois / motivo" exigidos para operação administrativa e
 * auditoria financeira. É append-only: nunca deve ser editado depois de
 * persistido.
 *
 * Nunca depender somente do log textual da aplicação para auditoria
 * financeira — eventos aqui são persistidos em coleção própria.
 */

export type AuditEventType =
  | 'ADMIN_ACTION'
  | 'ACCESS'
  | 'FINANCIAL'
  | 'AUTH'
  | 'SECURITY'
  | 'SYSTEM'
  | 'DATA_RETENTION';

export type AuditSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type AuditMetadata = Record<string, unknown>;

export interface IAuditEventInput {
  eventId?: string;
  type: AuditEventType;
  action: string;
  actorUserId: string;
  actorRole: string;
  resourceType: string;
  resourceId: string | undefined;
  before: AuditMetadata | undefined;
  after: AuditMetadata | undefined;
  reason: string | undefined;
  ip: string | undefined;
  requestId: string | undefined;
  severity: AuditSeverity;
  metadata: AuditMetadata;
  createdAt?: Date;
}

export interface IAuditEventDTO {
  eventId: string;
  type: AuditEventType;
  action: string;
  actorUserId: string;
  actorRole: string;
  resourceType: string;
  resourceId: string | undefined;
  before: AuditMetadata | undefined;
  after: AuditMetadata | undefined;
  reason: string | undefined;
  ip: string | undefined;
  requestId: string | undefined;
  severity: AuditSeverity;
  metadata: AuditMetadata;
  createdAt: Date;
}

export class AuditEvent {
  constructor(
    public readonly eventId: string,
    public readonly type: AuditEventType,
    public readonly action: string,
    public readonly actorUserId: string,
    public readonly actorRole: string,
    public readonly resourceType: string,
    public readonly resourceId: string | undefined,
    public readonly before: AuditMetadata | undefined,
    public readonly after: AuditMetadata | undefined,
    public readonly reason: string | undefined,
    public readonly ip: string | undefined,
    public readonly requestId: string | undefined,
    public readonly severity: AuditSeverity,
    public readonly metadata: AuditMetadata,
    public readonly createdAt: Date,
  ) {}

  static create(input: IAuditEventInput): AuditEvent {
    return new AuditEvent(
      input.eventId ?? new UniqueId().value,
      input.type,
      input.action,
      input.actorUserId,
      input.actorRole,
      input.resourceType,
      input.resourceId,
      input.before,
      input.after,
      input.reason,
      input.ip,
      input.requestId,
      input.severity,
      input.metadata ?? {},
      input.createdAt ?? new Date(),
    );
  }

  toDTO(): IAuditEventDTO {
    return {
      eventId: this.eventId,
      type: this.type,
      action: this.action,
      actorUserId: this.actorUserId,
      actorRole: this.actorRole,
      resourceType: this.resourceType,
      resourceId: this.resourceId,
      before: this.before,
      after: this.after,
      reason: this.reason,
      ip: this.ip,
      requestId: this.requestId,
      severity: this.severity,
      metadata: this.metadata,
      createdAt: this.createdAt,
    };
  }
}
