import request from 'supertest';
import express, { Router, RequestHandler } from 'express';
import { createApiServer } from '@/infrastructure/api/ApiServer';
import { AuditController } from '@/infrastructure/api/controllers/AuditController';
import { AuditService } from '@/core/audit/domain/services/AuditService';
import { InMemoryAuditEventRepository } from '@/core/audit/domain/repositories/InMemoryAuditEventRepository';
import { asyncHandler } from '@/infrastructure/api/middleware/asyncHandler';
import {
  AuthenticatedRequest,
  protectedRoute,
  requireAdminRole,
} from '@/infrastructure/api/middleware/AuthMiddleware';
import { appConfig } from '@/shared/config/appConfig';

describe('Admin Audit routes — Fase 15', () => {
  let app: express.Express;
  let repository: InMemoryAuditEventRepository;
  let auditService: AuditService;
  const adminUserId = 'admin-e2e';

  const impersonateAdmin: RequestHandler = (req, _res, next) => {
    (req as AuthenticatedRequest).authContext = {
      userId: adminUserId,
      sessionId: 'test-session',
    };
    next();
  };

  const buildServer = () => {
    appConfig.admin.allowedUserIds = [adminUserId];
    appConfig.audit.query.maxLimit = 200;
    appConfig.audit.query.defaultLimit = 50;

    auditService = new AuditService(repository);

    const controller = new AuditController(auditService, 30);

    const router = Router();
    router.use(impersonateAdmin);

    router.get(
      '/audit/events',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req, res) => controller.queryEvents(req, res)),
    );

    router.get(
      '/audit/events/:eventId',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req, res) => controller.getEvent(req, res)),
    );

    router.post(
      '/audit/retention/apply',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req, res) => controller.applyRetention(req, res)),
    );

    const server = createApiServer(0);
    server.registerRoutes(router, '/admin');
    server.registerErrorHandler();
    server.get404Handler();

    app = server.getExpressApp();
  };

  beforeEach(() => {
    repository = new InMemoryAuditEventRepository();
    buildServer();
  });

  it('retorna lista vazia de eventos por padrão', async () => {
    const res = await request(app).get('/api/admin/audit/events');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.events).toHaveLength(0);
    expect(res.body.data.total).toBe(0);
  });

  it('consulta eventos após registrar ação administrativa', async () => {
    await auditService.recordAdminAction({
      actorUserId: adminUserId,
      action: 'bet.settle',
      resourceType: 'bet',
      resourceId: 'bet-1',
      after: { result: 'WON' },
    });

    const res = await request(app).get('/api/admin/audit/events').query({ type: 'ADMIN_ACTION' });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.events[0].action).toBe('bet.settle');
    expect(res.body.data.events[0].resourceId).toBe('bet-1');
  });

  it('filtra por tipo e ator e aplica limite máximo', async () => {
    for (let i = 0; i < 5; i += 1) {
      await auditService.recordAdminAction({
        actorUserId: adminUserId,
        action: `action.${i}`,
        resourceType: 'test',
      });
    }
    await auditService.recordAccess({ action: 'http.request', resourceType: 'http' });

    const filtered = await request(app)
      .get('/api/admin/audit/events')
      .query({ type: 'ACCESS' });
    expect(filtered.body.data.total).toBe(1);

    const byActor = await request(app)
      .get('/api/admin/audit/events')
      .query({ actorUserId: adminUserId });
    expect(byActor.body.data.total).toBe(5);
  });

  it('consulta um evento pelo id', async () => {
    const event = await auditService.recordAdminAction({
      actorUserId: adminUserId,
      action: 'risk.user.reconcile',
      resourceType: 'user',
      resourceId: 'u-1',
    });
    expect(event).not.toBeNull();

    const res = await request(app).get(`/api/admin/audit/events/${event?.eventId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe('risk.user.reconcile');
  });

  it('retorna 404 para evento inexistente', async () => {
    const res = await request(app).get('/api/admin/audit/events/nao-existe');
    expect(res.status).toBe(404);
  });

  it('aplica retenção e retorna contagem', async () => {
    await auditService.recordAccess({ action: 'http.request', resourceType: 'http' });
    await auditService.recordAdminAction({
      actorUserId: adminUserId,
      action: 'test.action',
      resourceType: 'test',
    });

    const res = await request(app)
      .post('/api/admin/audit/retention/apply')
      .send({ retentionDays: 3650 });
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(0);
  });

  it('rejeita acesso não-admin', async () => {
    appConfig.admin.allowedUserIds = ['another-admin'];
    const res = await request(app).get('/api/admin/audit/events');
    expect(res.status).toBe(403);
  });
});
