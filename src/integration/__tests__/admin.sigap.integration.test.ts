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
  async transmit(input: { fileType: string }) {
    return { ackId: `ack-${input.fileType}`, receivedAt: new Date() };
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
  let sigapService: SigapService;
  const adminUserId = 'admin-sigap';

  const impersonateAdmin: RequestHandler = (req, _res, next) => {
    (req as AuthenticatedRequest).authContext = { userId: adminUserId, sessionId: 'test-session' };
    next();
  };

  const buildServer = () => {
    appConfig.admin.allowedUserIds = [adminUserId];
    appConfig.sigap.enabled = true;

    const auditService = new AuditService(new InMemoryAuditEventRepository());
    sigapService = new SigapService({
      submissionRepository: repository,
      transmissionProvider: new FakeTransmissionProvider(),
      impedimentProvider: new FakeImpedimentProvider() as never,
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
      .post('/api/admin/sigap/transmit')
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
      .post('/api/admin/sigap/transmit')
      .send({ fileType: 'APOSTADOR', referenceDate: '2026-08-28', payload: [{ id: 'u-1' }] });
    const res = await request(app).get('/api/admin/sigap/submissions');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].fileType).toBe('APOSTADOR');
  });

  it('retorna 404 para submissão inexistente', async () => {
    const res = await request(app).get('/api/admin/sigap/submissions/nao-existe');
    expect(res.status).toBe(404);
  });

  it('consulta impedimento de documento', async () => {
    const res = await request(app)
      .post('/api/admin/sigap/impediment')
      .send({ documentNumber: '111.444.777-35' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IMPEDED');
  });

  it('rejeita payload vazio com erro de validação', async () => {
    const res = await request(app)
      .post('/api/admin/sigap/transmit')
      .send({ fileType: 'APOSTADOR', referenceDate: '2026-08-28', payload: [] });
    expect(res.status).toBe(400);
  });

  it('rejeita acesso não-admin', async () => {
    appConfig.admin.allowedUserIds = ['outro-admin'];
    const res = await request(app).get('/api/admin/sigap/submissions');
    expect(res.status).toBe(403);
  });
});
