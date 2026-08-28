import { InMemoryAuditEventRepository } from '../InMemoryAuditEventRepository';
import { AuditEvent, IAuditEventInput } from '../../entities/AuditEvent';

const makeEvent = (overrides: Partial<IAuditEventInput> = {}): AuditEvent =>
  AuditEvent.create({
    eventId: overrides.eventId ?? 'evt-1',
    type: overrides.type ?? 'ADMIN_ACTION',
    action: overrides.action ?? 'test.action',
    actorUserId: overrides.actorUserId ?? 'admin-1',
    actorRole: overrides.actorRole ?? 'admin',
    resourceType: overrides.resourceType ?? 'test',
    resourceId: overrides.resourceId,
    before: overrides.before,
    after: overrides.after,
    reason: overrides.reason,
    ip: overrides.ip,
    requestId: overrides.requestId,
    severity: overrides.severity ?? 'INFO',
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? new Date(),
  });

describe('InMemoryAuditEventRepository', () => {
  let repo: InMemoryAuditEventRepository;

  beforeEach(() => {
    repo = new InMemoryAuditEventRepository();
  });

  it('append + findById round-trips', async () => {
    const event = makeEvent();
    await repo.append(event);
    await expect(repo.findById('evt-1')).resolves.toMatchObject({ eventId: 'evt-1' });
  });

  it('query filtra por tipo e ator', async () => {
    await repo.append(makeEvent({ eventId: 'a', type: 'ADMIN_ACTION', actorUserId: 'admin-1' }));
    await repo.append(makeEvent({ eventId: 'b', type: 'ACCESS', actorUserId: 'user-1' }));
    const r = await repo.query({ type: 'ADMIN_ACTION' });
    expect(r.total).toBe(1);
    expect(r.events[0].eventId).toBe('a');
    const r2 = await repo.query({ actorUserId: 'user-1' });
    expect(r2.total).toBe(1);
    expect(r2.events[0].eventId).toBe('b');
  });

  it('query aplica paginação', async () => {
    for (let i = 0; i < 5; i += 1) {
      await repo.append(makeEvent({ eventId: `e${i}` }));
    }
    const page = await repo.query({ limit: 2, offset: 0 });
    expect(page.events).toHaveLength(2);
    expect(page.total).toBe(5);
  });

  it('deleteOlderThan remove apenas eventos antigos', async () => {
    const now = Date.now();
    await repo.append(makeEvent({ eventId: 'old', createdAt: new Date(now - 100000) }));
    await repo.append(makeEvent({ eventId: 'new', createdAt: new Date(now) }));
    const deleted = await repo.deleteOlderThan(new Date(now - 50000));
    expect(deleted).toBe(1);
    await expect(repo.findById('old')).resolves.toBeNull();
    await expect(repo.findById('new')).resolves.not.toBeNull();
  });
});
