import { MongooseAuditEventRepository } from '../MongooseAuditEventRepository';
import { AuditEventModel } from '../../schemas/AuditEventSchema';
import { AuditEvent, IAuditEventInput } from '@/core/audit/domain/entities/AuditEvent';

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

describe('MongooseAuditEventRepository (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('append usa updateOne com upsert', async () => {
    const spy = jest.spyOn(AuditEventModel, 'updateOne').mockResolvedValue({} as any);
    const repo = new MongooseAuditEventRepository();
    const event = makeEvent({ eventId: 'evt-1' });
    await repo.append(event);
    expect(spy).toHaveBeenCalled();
    const args = spy.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(args[0].eventId).toBe('evt-1');
  });

  it('findById retorna domínio a partir de doc', async () => {
    jest.spyOn(AuditEventModel, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        eventId: 'evt-1',
        type: 'ADMIN_ACTION',
        action: 'bet.settle',
        actorUserId: 'admin-1',
        actorRole: 'admin',
        resourceType: 'bet',
        resourceId: 'bet-1',
        before: { status: 'PENDING' },
        after: { result: 'WON' },
        reason: 'x',
        ip: '127.0.0.1',
        requestId: 'req-1',
        severity: 'INFO',
        metadata: {},
        createdAt: new Date('2026-08-01'),
      } as any),
    } as any);
    const repo = new MongooseAuditEventRepository();
    const event = await repo.findById('evt-1');
    expect(event).not.toBeNull();
    expect(event?.resourceId).toBe('bet-1');
    expect(event?.before).toEqual({ status: 'PENDING' });
  });

  it('findById retorna null quando não existe', async () => {
    jest.spyOn(AuditEventModel, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    } as any);
    const repo = new MongooseAuditEventRepository();
    await expect(repo.findById('missing')).resolves.toBeNull();
  });

  it('query aplica filtros e paginação', async () => {
    const findSpy = jest.spyOn(AuditEventModel, 'find').mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue([
          makeEvent({ eventId: 'e1', type: 'ACCESS' }).toDTO(),
        ] as any),
    } as any);
    const countSpy = jest.spyOn(AuditEventModel, 'countDocuments').mockResolvedValue(1);

    const repo = new MongooseAuditEventRepository();
    const result = await repo.query({ type: 'ACCESS', limit: 10, offset: 0 });

    expect(result.total).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(findSpy).toHaveBeenCalled();
    expect(countSpy).toHaveBeenCalled();
  });

  it('deleteOlderThan chama deleteMany e retorna contagem', async () => {
    jest
      .spyOn(AuditEventModel, 'deleteMany')
      .mockResolvedValue({ deletedCount: 3, acknowledged: true } as any);
    const repo = new MongooseAuditEventRepository();
    const deleted = await repo.deleteOlderThan(new Date());
    expect(deleted).toBe(3);
  });
});
