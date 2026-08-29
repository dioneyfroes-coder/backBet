import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { TransmitSigapFile } from '@/core/sigap/application/use-cases/TransmitSigapFile';
import { GetSigapSubmissions } from '@/core/sigap/application/use-cases/GetSigapSubmissions';
import { GetSigapSubmission } from '@/core/sigap/application/use-cases/GetSigapSubmission';
import { CheckSigapImpediment } from '@/core/sigap/application/use-cases/CheckSigapImpediment';
import {
  SigapQueryDTO,
  SigapQueryDTOType,
  SigapTransmitDTO,
  SigapTransmitDTOType,
  SigapImpedimentDTO,
  SigapImpedimentDTOType,
} from '../dtos/SigapDTOs';
import { appConfig } from '@/shared/config/appConfig';
import { AuditService } from '@/core/audit/domain/services/AuditService';
import { getRequestContext } from '@/shared/observability/requestContext';

export class SigapController extends BaseController {
  constructor(
    private readonly transmitFileUseCase: TransmitSigapFile,
    private readonly getSubmissionsUseCase: GetSigapSubmissions,
    private readonly getSubmissionUseCase: GetSigapSubmission,
    private readonly checkImpedimentUseCase: CheckSigapImpediment,
    private readonly auditService?: AuditService,
  ) {
    super();
  }

  private auditAdminAction(req: Request, action: string, resourceId?: string, after?: Record<string, unknown>): void {
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
        action,
        resourceType: 'sigap_submission',
        resourceId,
        after,
        ip,
        requestId: (req as Request & { id?: string }).id || ctx?.requestId,
      })
      .catch(() => undefined);
  }

  /**
   * @openapi
   * /api/v1/admin/sigap/transmit:
   *   post:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Transmite um arquivo ao SIGAP
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               fileType: { type: string, enum: [APOSTADOR, APOSTAS, CARTEIRA, OPERADOR_DIARIO, OPERADOR_MENSAL] }
   *               referenceDate: { type: string }
   *               payload: { type: array, items: { type: object } }
   *     responses:
   *       '200':
   *         description: Remessa transmitida
   */
  async transmit(req: Request, res: Response) {
    try {
      const payload = this.validateSchema(SigapTransmitDTO, req.body ?? {}) as SigapTransmitDTOType;
      const submission = await this.transmitFileUseCase.execute({
        fileType: payload.fileType,
        referenceDate: payload.referenceDate,
        payload: payload.payload,
        operatorId: payload.operatorId,
      });
      this.auditAdminAction(req, 'sigap.transmit', submission.id, {
        fileType: payload.fileType,
        referenceDate: payload.referenceDate,
        status: submission.status,
      });
      return this.ok(res, submission.toDTO());
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/v1/admin/sigap/submissions:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Consulta remessas SIGAP registradas
   *     responses:
   *       '200':
   *         description: Lista de remessas
   */
  async querySubmissions(req: Request, res: Response) {
    try {
      const payload = (this.validateSchema(
        SigapQueryDTO,
        req.query as Record<string, unknown>,
      ) as SigapQueryDTOType) ?? {};
      const maxLimit = appConfig.sigap.query.maxLimit;
      const limit = payload.limit ? Math.min(payload.limit, maxLimit) : appConfig.sigap.query.defaultLimit;
      const result = await this.getSubmissionsUseCase.execute({
        limit,
        offset: payload.offset,
        fileType: payload.fileType,
        status: payload.status,
        referenceDate: payload.referenceDate,
      });
      return this.ok(res, result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/v1/admin/sigap/submissions/{id}:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Consulta uma remessa SIGAP pelo id
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       '200':
   *         description: Remessa
   *       '404':
   *         description: Remessa não encontrada
   */
  async getSubmission(req: Request, res: Response) {
    try {
      const submission = await this.getSubmissionUseCase.execute(req.params.id);
      if (!submission) {
        return this.notFound(res, 'Remessa SIGAP não encontrada');
      }
      return this.ok(res, submission);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/v1/admin/sigap/impediment:
   *   post:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Consulta se um documento (CPF) está impedido de apostar
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               documentNumber: { type: string }
   *     responses:
   *       '200':
   *         description: Resultado da consulta
   */
  async checkImpediment(req: Request, res: Response) {
    try {
      const payload = this.validateSchema(
        SigapImpedimentDTO,
        req.body ?? {},
      ) as SigapImpedimentDTOType;
      const result = await this.checkImpedimentUseCase.execute(payload.documentNumber);
      this.auditAdminAction(req, 'sigap.impediment', undefined, {
        status: result.status,
        reference: result.reference,
      });
      return this.ok(res, result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}
