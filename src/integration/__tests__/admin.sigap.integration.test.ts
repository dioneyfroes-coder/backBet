import request from 'supertest';
import express, { Router, RequestHandler } from 'express';
import { createApiServer } from '@/infrastructure/api/ApiServer';
import { SigapController } from '@/infrastructure/api/controllers/SigapController';
import { SigapService } from '@/core/sigap/domain/services/SigapService';
import { InMemorySigapSubmissionRepository } from '@/core/sigap/domain/repositories/InMemorySigapSubmissionRepository';
import { TransmitSigapFile } from '@/core/sigap/application/use-cases/TransmitSigapFile';
import { GetSigapSubmissions } from '@/core/sigap/application/use-cases/GetSigapSubmissions';
import { GetSigapSubmission } from '@/core/sigap/application/use-cases/GetSigapSubmission';
import { CheckSigapImpediment } from '@/core/sigap/application/use-cases/CheckSigapImpediment';
import { ISigapTransmissionPort } from '@/core/sigap/domain/ports/ISigapTransmissionPort';
import { asyncHandler } from '@/infrastructure/api/middleware/asyncHandler';
import {
  AuthenticatedRequest,
  protectedRoute,
  requireAdminRole,
} from '@/infrastructure/api/middleware/AuthMiddleware';
import { AuditService } from '@/core/audit/domain/services/AuditService';
import { InMemoryAuditEventRepository } from '@/core/audit/domain/repositories/InMemoryAuditEventRepository';
import { appConfig } from '@/shared/config/appConfig';

class FakeTransmissionProvider implements ISigapTransmissionPort {
  public failNext = false;
  public rejectNext: { code?: string; reason?: string } | undefined;

  async transmit(input: { fileType: string }) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('falha simulada na transmissão');
    }
    const rejection = this.rejectNext;
    this.rejectNext = undefined;
    if (rejection) {
      return {
        status: 'REJECTED' as const,
        rejectionCode: rejection.code ?? 'SIGAP_REJECTED',
        rejectionReason: rejection.reason ?? 'arquivo rejeitado pela SPA',
        receivedAt: new Date(),
      };
    }
    return { status: 'ACKED' as const, ackId: `ack-${input.fileType}`, receivedAt: new Date() };
  }
}

class FakeImpedimentProvider {
  async checkImpediment(documentNumber: string) {
    return {
      status: 'IMPEDED' as const,
      reference: `mock-${documentNumber.replace(/\D/g, '')}`,
    };
  }
}

describe('Admin SIGAP routes — Fase 16', () => {
  let app: express.Express;
  let repository: InMemorySigapSubmissionRepository;
  let auditRepository: InMemoryAuditEventRepository;
  let transmissionProvider: FakeTransmissionProvider;
  let sigapService: SigapService;
  const adminUserId = 'admin-sigap';

  const impersonateAdmin: RequestHandler = (req, _res, next) => {
    (req as AuthenticatedRequest).authContext = { userId: adminUserId, sessionId: 'test-session' };
    next();
  };

  const buildServer = () => {
    appConfig.admin.allowedUserIds = [adminUserId];
    appConfig.sigap.enabled = true;

    auditRepository = new InMemoryAuditEventRepository();
    const auditService = new AuditService(auditRepository);
    transmissionProvider = new FakeTransmissionProvider();
    sigapService = new SigapService({
      submissionRepository: repository,
      transmissionProvider,
      impedimentProvider: new FakeImpedimentProvider() as never,
      retryMaxAttempts: 2,
    });
    const controller = new SigapController(
      new TransmitSigapFile(sigapService),
      new GetSigapSubmissions(sigapService),
      new GetSigapSubmission(sigapService),
      new CheckSigapImpediment(sigapService),
      auditService,
    );

    const router = Router();
    router.use(impersonateAdmin);
    router.post(
      '/sigap/transmit',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req, res) => controller.transmit(req, res)),
    );
    router.get(
      '/sigap/submissions',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req, res) => controller.querySubmissions(req, res)),
    );
    router.get(
      '/sigap/submissions/:id',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req, res) => controller.getSubmission(req, res)),
    );
    router.post(
      '/sigap/impediment',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req, res) => controller.checkImpediment(req, res)),
    );

    const server = createApiServer(0);
    server.registerRoutes(router, '/admin');
    server.registerErrorHandler();
    server.get404Handler();
    app = server.getExpressApp();
  };

  beforeEach(() => {
    repository = new InMemorySigapSubmissionRepository();
    buildServer();
  });

  it('transmite um arquivo SIGAP e retorna ACKED', async () => {
    const res = await request(app)
      .post('/api/v1/admin/sigap/transmit')
      .send({
        fileType: 'OPERADOR_DIARIO',
        referenceDate: '2026-08-28',
        payload: [{ totalApostas: 3 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ACKED');
    expect(res.body.data.ackId).toContain('OPERADOR_DIARIO');
  });

  it('lista submissões após transmitir', async () => {
    await request(app)
      .post('/api/v1/admin/sigap/transmit')
      .send({ fileType: 'APOSTADOR', referenceDate: '2026-08-28', payload: [{ id: 'u-1' }] });
    const res = await request(app).get('/api/v1/admin/sigap/submissions');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].fileType).toBe('APOSTADOR');
  });

  it('retorna 404 para submissão inexistente', async () => {
    const res = await request(app).get('/api/v1/admin/sigap/submissions/nao-existe');
    expect(res.status).toBe(404);
  });

  it('consulta impedimento de documento', async () => {
    const res = await request(app)
      .post('/api/v1/admin/sigap/impediment')
      .send({ documentNumber: '111.444.777-35' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IMPEDED');
  });

  it('rejeita payload vazio com erro de validação', async () => {
    const res = await request(app)
      .post('/api/v1/admin/sigap/transmit')
      .send({ fileType: 'APOSTADOR', referenceDate: '2026-08-28', payload: [] });
    expect(res.status).toBe(400);
  });

  it('persiste a remessa como REJECTED quando a SPA rejeita o arquivo', async () => {
    transmissionProvider.rejectNext = { code: 'SIGAP_SCHEMA_INVALID', reason: 'formato inválido' };
    const res = await request(app)
      .post('/api/v1/admin/sigap/transmit')
      .send({ fileType: 'APOSTAS', referenceDate: '2026-08-28', payload: [{ id: 'b-1' }] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('REJECTED');
    expect(res.body.data.errorCode).toBe('SIGAP_SCHEMA_INVALID');

    const list = await request(app).get('/api/v1/admin/sigap/submissions');
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.items[0].status).toBe('REJECTED');
  });

  it('falha de transmissão marca FAILED e uma nova tentativa reenvia (retry)', async () => {
    transmissionProvider.failNext = true;
    const first = await request(app)
      .post('/api/v1/admin/sigap/transmit')
      .send({ fileType: 'CARTEIRA', referenceDate: '2026-08-28', payload: [{ id: 'u-1' }] });
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('FAILED');

    const second = await request(app)
      .post('/api/v1/admin/sigap/transmit')
      .send({ fileType: 'CARTEIRA', referenceDate: '2026-08-28', payload: [{ id: 'u-1' }] });
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('ACKED');
    expect(second.body.data.attemptCount).toBe(2);
  });

  it('respeita o teto de retry: após retryMaxAttempts não chama mais o provedor', async () => {
    // retryMaxAttempts = 2 (buildServer): tentativas 1 e 2 usam o provedor.
    await request(app)
      .post('/api/v1/admin/sigap/transmit')
      .send({ fileType: 'OPERADOR_MENSAL', referenceDate: '2026-08-28', payload: [{ total: 1 }] });
    await request(app)
      .post('/api/v1/admin/sigap/transmit')
      .send({ fileType: 'OPERADOR_MENSAL', referenceDate: '2026-08-28', payload: [{ total: 1 }] });

    const third = await request(app)
      .post('/api/v1/admin/sigap/transmit')
      .send({ fileType: 'OPERADOR_MENSAL', referenceDate: '2026-08-28', payload: [{ total: 1 }] });
    expect(third.status).toBe(200);
    expect(third.body.data.status).toBe('FAILED');
    expect(third.body.data.errorCode).toBe('SIGAP_RETRY_LIMIT_EXCEEDED');
    expect(third.body.data.attemptCount).toBe(2);
  });

  it('registra auditoria nas ações admin de transmit e impediment', async () => {
    const transmit = await request(app)
      .post('/api/v1/admin/sigap/transmit')
      .send({ fileType: 'OPERADOR_DIARIO', referenceDate: '2026-08-28', payload: [{ total: 1 }] });
    expect(transmit.status).toBe(200);

    await request(app)
      .post('/api/v1/admin/sigap/impediment')
      .send({ documentNumber: '111.444.777-35' });

    await new Promise((resolve) => setImmediate(resolve));
    const events = await auditRepository.query({ resourceType: 'sigap_submission' });
    expect(events.total).toBeGreaterThanOrEqual(2);
    const actions = events.events.map((e) => e.action);
    expect(actions).toContain('sigap.transmit');
    expect(actions).toContain('sigap.impediment');
  });

  it('rejeita acesso não-admin', async () => {
    appConfig.admin.allowedUserIds = ['outro-admin'];
    const res = await request(app).get('/api/v1/admin/sigap/submissions');
    expect(res.status).toBe(403);
  });
});
