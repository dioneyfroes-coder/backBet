import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ResolveBetUseCase } from '@core/betting/application/use-cases/ResolveBetUseCase';
import { UpdateEventStatusUseCase } from '@core/betting/application/use-cases/UpdateEventStatusUseCase';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { EventCatalogService } from '@core/betting/domain/services/EventCatalogService';
import { SettleBetDTO, SettleBetDTOType } from '../dtos/AdminDTOs';
import { UpdateEventStatusDTO, UpdateEventStatusDTOType } from '../dtos/EventDTOs';
import { appConfig } from '@/shared/config/appConfig';
import { getObservabilityToggles } from '@/shared/observability/featureToggles';
import { flushEventOddsCache } from '@/infrastructure/cache/cacheHooks';
import { AuditService } from '@/core/audit/domain/services/AuditService';
import { getRequestContext } from '@/shared/observability/requestContext';

export class AdminController extends BaseController {
  constructor(
    private readonly resolveBetUseCase: ResolveBetUseCase,
    private readonly updateEventStatusUseCase: UpdateEventStatusUseCase,
    private readonly riskService: RiskService,
    private readonly eventCatalogService: EventCatalogService,
    private readonly dependencyHealthProvider?: () => Record<'redis' | 'mongo', number>,
    private readonly auditService?: AuditService,
  ) {
    super();
  }

  private auditAdminAction(req: Request, input: {
    action: string;
    resourceType: string;
    resourceId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason?: string;
  }): void {
    if (!this.auditService) {
      return;
    }
    const ctx = getRequestContext();
    const ip =
      req.ip ||
      (Array.isArray(req.headers['x-forwarded-for'])
        ? req.headers['x-forwarded-for'][0]
        : req.headers['x-forwarded-for']?.split(',')[0].trim());
    void this.auditService
      .recordAdminAction({
        actorUserId:
          (req as Request & { authContext?: { userId?: string } }).authContext?.userId || 'unknown',
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        before: input.before,
        after: input.after,
        reason: input.reason,
        ip,
        requestId: (req as Request & { id?: string }).id || ctx?.requestId,
      })
      .catch(() => undefined);
  }

  /**
   * @openapi
   * /api/admin/overview:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Visão geral do backoffice
   *     responses:
   *       '200':
   *         description: Status e limites administrativos
   */
  async getOverview(_req: Request, res: Response) {
    return this.ok(res, {
      service: {
        appName: appConfig.project.appName,
        serviceName: appConfig.project.serviceName,
        env: appConfig.runtime.env,
      },
      observability: getObservabilityToggles(),
      risk: {
        maxExposurePerUser: this.riskService.getMaxExposure(),
      },
      dependencies: this.dependencyHealthProvider ? this.dependencyHealthProvider() : null,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * @openapi
   * /api/admin/risk/users/{userId}:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Consulta exposição de risco de um usuário
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Dados de risco do usuário
   */
  async getRiskForUser(req: Request, res: Response) {
    try {
      const exposure = await this.riskService.getExposureForUser(req.params.userId);
      return this.ok(res, {
        userId: req.params.userId,
        exposure,
        maxExposure: this.riskService.getMaxExposure(),
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/risk/users/{userId}/reconcile:
   *   post:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Reconcilia a exposição de risco de um usuário (estado operacional vs histórico de apostas)
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Resultado da reconciliação
   */
  async reconcileRiskForUser(req: Request, res: Response) {
    try {
      const result = await this.riskService.reconcileUserRisk(req.params.userId);
      this.auditAdminAction(req, {
        action: 'risk.user.reconcile',
        resourceType: 'user',
        resourceId: req.params.userId,
        after: { result },
        reason: 'Administrative risk reconciliation',
      });
      return this.ok(res, result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/bets/{betId}/settle:
   *   post:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Liquida manualmente uma aposta
   *     parameters:
   *       - in: path
   *         name: betId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               result:
   *                 type: string
   *                 enum: [WON, LOST]
   *               marketResult:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Aposta liquidada
   */
  async settleBet(req: Request, res: Response) {
    try {
      const payload = this.validateSchema(SettleBetDTO, req.body) as SettleBetDTOType;
      const idempotencyKey = typeof req.get === 'function'
        ? req.get('Idempotency-Key') ?? undefined
        : undefined;
      const bet = idempotencyKey
        ? await this.resolveBetUseCase.execute(
            {
              betId: req.params.betId,
              result: payload.result,
              marketResult: payload.marketResult,
            },
            idempotencyKey,
          )
        : await this.resolveBetUseCase.execute({
            betId: req.params.betId,
            result: payload.result,
            marketResult: payload.marketResult,
          });
      this.auditAdminAction(req, {
        action: 'bet.settle',
        resourceType: 'bet',
        resourceId: req.params.betId,
        after: { result: payload.result, marketResult: payload.marketResult },
        reason: 'Administrative bet settlement',
      });
      return this.ok(res, bet.toJSON());
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/events/{eventId}/status:
   *   patch:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Atualiza status de um evento
   *     parameters:
   *       - in: path
   *         name: eventId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               action:
   *                 type: string
   *                 enum: [START, FINISH, CANCEL]
   *     responses:
   *       '200':
   *         description: Evento atualizado
   */
  async updateEventStatus(req: Request, res: Response) {
    try {
      const payload = this.validateSchema(
        UpdateEventStatusDTO,
        req.body,
      ) as UpdateEventStatusDTOType;
      const event = await this.updateEventStatusUseCase.execute(req.params.eventId, payload.action);
      await flushEventOddsCache(event.id).catch((error) =>
        console.warn('Failed to flush cache after event status update', error),
      );
      this.auditAdminAction(req, {
        action: 'event.status',
        resourceType: 'event',
        resourceId: req.params.eventId,
        after: { action: payload.action },
        reason: 'Administrative event status update',
      });
      return this.ok(res, event.toJSON());
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}
