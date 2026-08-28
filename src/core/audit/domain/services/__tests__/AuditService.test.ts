import { AuditService } from '../AuditService';
import { InMemoryAuditEventRepository } from '../../repositories/InMemoryAuditEventRepository';
import { AuditEvent } from '../../entities/AuditEvent';

describe('AuditService — Fase 15: auditoria', () => {
  let repository: InMemoryAuditEventRepository;
  let service: AuditService;

  beforeEach(() => {
    repository = new InMemoryAuditEventRepository();
    service = new AuditService(repository);
  });

  it('registra um evento de auditoria com todos os campos', async () => {
    const event = await service.recordAdminAction({
      actorUserId: 'admin-1',
      action: 'bet.settle',
      resourceType: 'bet',
      resourceId: 'bet-1',
      before: { status: 'PENDING' },
      after: { result: 'WON' },
      reason: 'Administrative settlement',
      ip: '127.0.0.1',
      requestId: 'req-1',
    });
    expect(event).not.toBeNull();
    expect(event?.type).toBe('ADMIN_ACTION');
    expect(event?.actorRole).toBe('admin');
    expect(event?.resourceId).toBe('bet-1');
    expect(event?.before).toEqual({ status: 'PENDING' });
    expect(event?.after).toEqual({ result: 'WON' });
    expect(repository.size).toBe(1);
  });

  it('gera um eventId único a cada evento', async () => {
    const a = await service.recordAccess({
      action: 'http.request',
      resourceType: 'http',
    });
    const b = await service.recordAccess({
      action: 'http.request',
      resourceType: 'http',
    });
    expect(a?.eventId).toBeTruthy();
    expect(b?.eventId).toBeTruthy();
    expect(a?.eventId).not.toBe(b?.eventId);
  });

  it('registra logs de acesso com metadata', async () => {
    await service.recordAccess({
      action: 'http.request',
      actorUserId: 'user-1',
      resourceType: 'http',
      ip: '10.0.0.1',
      requestId: 'req-2',
      status: 200,
      method: 'GET',
      path: '/api/wallets/me',
      durationMs: 15,
    });
    const { events, total } = await service.query({ type: 'ACCESS' });
    expect(total).toBe(1);
    expect(events[0].actorUserId).toBe('user-1');
    expect((events[0].metadata as Record<string, unknown>).status).toBe(200);
  });

  it('consulta eventos com filtros e ordena por createdAt decrescente', async () => {
    await service.recordAccess({ action: 'http.request', actorUserId: 'user-1', resourceType: 'http' });
    await service.recordAccess({ action: 'http.request', actorUserId: 'user-2', resourceType: 'http' });
    const all = await service.query();
    expect(all.total).toBe(2);

    const filtered = await service.query({ actorUserId: 'user-2' });
    expect(filtered.total).toBe(1);
    expect(filtered.events[0].actorUserId).toBe('user-2');

    const byType = await service.query({ type: 'ADMIN_ACTION' });
    expect(byType.total).toBe(0);
  });

  it('aplica a política de retenção removendo eventos antigos', async () => {
    const recent = await service.recordAccess({ action: 'http.request', resourceType: 'http' });
    expect(recent).not.toBeNull();

    const old = AuditEvent.create({
      type: 'ACCESS',
      action: 'http.request',
      actorUserId: 'user-x',
      actorRole: 'user',
      resourceType: 'http',
      resourceId: undefined,
      before: undefined,
      after: undefined,
      reason: undefined,
      ip: undefined,
      requestId: undefined,
      severity: 'INFO',
      metadata: {},
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    await repository.append(old);
    expect(repository.size).toBe(2);

    const deleted = await service.applyRetentionPolicy(5);
    expect(deleted).toBe(1);
    expect(repository.size).toBe(2);

    const { events, total } = await service.query({ type: 'DATA_RETENTION' });
    expect(total).toBe(1);
    expect((events[0].metadata as Record<string, unknown>).deleted).toBe(1);
  });

  it('rejeita retenção com dias negativos', async () => {
    await expect(service.applyRetentionPolicy(-1)).rejects.toMatchObject({
      code: 'AUDIT_INVALID_RETENTION_DAYS',
    });
  });
});
