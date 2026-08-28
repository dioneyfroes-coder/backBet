import { AppError } from '@/shared/errors/AppError';
import {
  AuditEvent,
  IAuditEventInput,
  AuditSeverity,
  IAuditEventDTO,
} from '../entities/AuditEvent';
import { AuditEventQueryOptions } from '../repositories/IAuditEventRepository';
import { IAuditEventRepository } from '../repositories/IAuditEventRepository';

export type RecordAuditEventInput = Omit<IAuditEventInput, 'eventId' | 'createdAt'>;

export class AuditService {
  constructor(private readonly repository: IAuditEventRepository) {}

  /**
   * Registra um evento de auditoria (append-only). Nunca falha a operação
   * de negócio que o invoca: se a persistência de auditoria falhar, o erro
   * é registrado em log, mas o fluxo principal continua.
   */
  async record(input: RecordAuditEventInput): Promise<AuditEvent | null> {
    try {
      const event = AuditEvent.create({ ...input });
      return await this.repository.append(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      console.error('Falha ao registrar evento de auditoria', { error: message, action: input.action });
      return null;
    }
  }

  async recordAdminAction(input: {
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason?: string;
    ip?: string;
    requestId?: string;
    severity?: AuditSeverity;
    metadata?: Record<string, unknown>;
  }): Promise<AuditEvent | null> {
    return this.record({
      type: 'ADMIN_ACTION',
      action: input.action,
      actorUserId: input.actorUserId,
      actorRole: 'admin',
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      before: input.before,
      after: input.after,
      reason: input.reason,
      ip: input.ip,
      requestId: input.requestId,
      severity: input.severity ?? 'INFO',
      metadata: input.metadata ?? {},
    });
  }

  async recordAccess(input: {
    action: string;
    actorUserId?: string;
    resourceType: string;
    resourceId?: string;
    ip?: string;
    requestId?: string;
    status?: number;
    method?: string;
    path?: string;
    durationMs?: number;
  }): Promise<AuditEvent | null> {
    return this.record({
      type: 'ACCESS',
      action: input.action,
      actorUserId: input.actorUserId ?? 'anonymous',
      actorRole: input.actorUserId ? 'user' : 'anonymous',
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      before: undefined,
      after: undefined,
      reason: undefined,
      ip: input.ip,
      requestId: input.requestId,
      severity: 'INFO',
      metadata: {
        status: input.status,
        method: input.method,
        path: input.path,
        durationMs: input.durationMs,
      },
    });
  }

  async findById(eventId: string): Promise<IAuditEventDTO | null> {
    const event = await this.repository.findById(eventId);
    return event ? event.toDTO() : null;
  }

  async query(options: AuditEventQueryOptions = {}) {
    const result = await this.repository.query(options);
    return {
      events: result.events.map((e) => e.toDTO()),
      total: result.total,
    };
  }

  /**
   * Aplica a política de retenção: remove eventos mais antigos que o
   * threshold. Retorna a quantidade removida.
   */
  async applyRetentionPolicy(retentionDays: number): Promise<number> {
    if (retentionDays < 0) {
      throw new AppError('AUDIT_INVALID_RETENTION_DAYS', 'Retention days must be >= 0', 400);
    }
    const threshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const deleted = await this.repository.deleteOlderThan(threshold);
    if (deleted > 0) {
      await this.record({
        type: 'DATA_RETENTION',
        action: 'retention.purge',
        actorUserId: 'system',
        actorRole: 'system',
        resourceType: 'audit_event',
        resourceId: undefined,
        before: undefined,
        after: undefined,
        reason: 'Retention policy applied',
        ip: undefined,
        requestId: undefined,
        severity: 'INFO',
        metadata: { deleted, retentionDays, threshold: threshold.toISOString() },
      });
    }
    return deleted;
  }

  get repositoryImpl(): IAuditEventRepository {
    return this.repository;
  }
}
