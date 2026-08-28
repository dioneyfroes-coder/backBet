import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { AuditService } from '@/core/audit/domain/services/AuditService';
import { AuditQueryDTO, AuditQueryDTOType, AuditRetentionApplyDTO, AuditRetentionApplyDTOType } from '../dtos/AuditDTOs';
import { appConfig } from '@/shared/config/appConfig';
import { getRequestContext } from '@/shared/observability/requestContext';

export class AuditController extends BaseController {
  constructor(
    private readonly auditService: AuditService,
    private readonly retentionDaysDefault?: number,
  ) {
    super();
  }

  /**
   * @openapi
   * /api/admin/audit/events:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Consulta eventos de auditoria
   *     parameters:
   *       - in: query
   *         name: type
   *         schema: { type: string }
   *       - in: query
   *         name: actorUserId
   *         schema: { type: string }
   *       - in: query
   *         name: limit
   *         schema: { type: integer }
   *       - in: query
   *         name: offset
   *         schema: { type: integer }
   *       - in: query
   *         name: from
   *         schema: { type: string }
   *       - in: query
   *         name: to
   *         schema: { type: string }
   *     responses:
   *       '200':
   *         description: Lista de eventos de auditoria
   */
  async queryEvents(req: Request, res: Response) {
    try {
      const payload = (this.validateSchema(
        AuditQueryDTO,
        req.query as Record<string, unknown>,
      ) as AuditQueryDTOType) ?? {};

      let from: Date | undefined;
      let to: Date | undefined;
      if (payload.from) {
        const parsed = new Date(payload.from);
        if (!Number.isNaN(parsed.getTime())) {
          from = parsed;
        }
      }
      if (payload.to) {
        const parsed = new Date(payload.to);
        if (!Number.isNaN(parsed.getTime())) {
          to = parsed;
        }
      }

      const maxLimit = appConfig.audit.query.maxLimit;
      const limit = payload.limit ? Math.min(payload.limit, maxLimit) : appConfig.audit.query.defaultLimit;

      const result = await this.auditService.query({
        type: payload.type,
        actorUserId: payload.actorUserId,
        resourceType: payload.resourceType,
        limit,
        offset: payload.offset,
        from,
        to,
      });

      return this.ok(res, result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/audit/events/{eventId}:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Consulta um evento de auditoria pelo id
   *     parameters:
   *       - in: path
   *         name: eventId
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       '200':
   *         description: Evento de auditoria
   *       '404':
   *         description: Evento não encontrado
   */
  async getEvent(req: Request, res: Response) {
    try {
      const event = await this.auditService.findById(req.params.eventId);
      if (!event) {
        return this.notFound(res, 'Evento de auditoria não encontrado');
      }
      return this.ok(res, event);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/audit/retention/apply:
   *   post:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Aplica a política de retenção removendo eventos antigos
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               retentionDays:
   *                 type: integer
   *     responses:
   *       '200':
   *         description: Quantidade de eventos removidos
   */
  async applyRetention(req: Request, res: Response) {
    try {
      const payload = this.validateSchema(
        AuditRetentionApplyDTO,
        req.body ?? {},
      ) as AuditRetentionApplyDTOType;
      const retentionDays = payload.retentionDays ?? this.retentionDaysDefault ?? appConfig.audit.retentionDays;
      const deleted = await this.auditService.applyRetentionPolicy(retentionDays);
      const requestContext = getRequestContext();
      return this.ok(res, {
        deleted,
        retentionDays,
        requestId: (req as Request & { id?: string }).id || requestContext?.requestId,
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}
