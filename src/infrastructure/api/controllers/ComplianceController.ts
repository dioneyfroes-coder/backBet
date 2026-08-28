import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { AuthenticatedRequest, getRequestUserId } from '../middleware/AuthMiddleware';
import {
  VerifyIdentityDTO,
  VerifyIdentityDTOType,
  UpdateResponsibleGamblingDTO,
  UpdateResponsibleGamblingDTOType,
} from '../dtos/ComplianceDTOs';
import { VerifyUserIdentity } from '@core/compliance/application/use-cases/VerifyUserIdentity';
import { GetIdentityVerification } from '@core/compliance/application/use-cases/GetIdentityVerification';
import { GetResponsibleGamblingProfile } from '@core/responsibleGambling/application/use-cases/GetResponsibleGamblingProfile';
import { UpdateResponsibleGamblingSettings } from '@core/responsibleGambling/application/use-cases/UpdateResponsibleGamblingSettings';

/**
 * ComplianceController — endpoints de compliance (KYC/identidade) e jogo
 * responsável (Fase 14). Mantém os provedores plugáveis (geolocalização,
 * integridade de dispositivo) fora da exposição HTTP por enquanto.
 */
export class ComplianceController extends BaseController {
  constructor(
    private getIdentityVerificationUseCase: GetIdentityVerification,
    private verifyUserIdentityUseCase: VerifyUserIdentity,
    private getResponsibleGamblingUseCase: GetResponsibleGamblingProfile,
    private updateResponsibleGamblingUseCase: UpdateResponsibleGamblingSettings,
  ) {
    super();
  }

  async getIdentityVerification(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);
    if (!userId) return this.unauthorized(res, 'Autenticação requerida');

    const verification = await this.getIdentityVerificationUseCase.execute(userId);
    return this.ok(res, { verification });
  }

  async verifyIdentity(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);
    if (!userId) return this.unauthorized(res, 'Autenticação requerida');

    const payload = this.validateSchema(VerifyIdentityDTO, req.body as VerifyIdentityDTOType) as VerifyIdentityDTOType;
    const verification = await this.verifyUserIdentityUseCase.execute(userId, payload);
    return this.ok(res, { verification: verification.toDTO() });
  }

  async getResponsibleGambling(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);
    if (!userId) return this.unauthorized(res, 'Autenticação requerida');

    const profile = await this.getResponsibleGamblingUseCase.execute(userId);
    return this.ok(res, { profile });
  }

  async updateResponsibleGambling(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);
    if (!userId) return this.unauthorized(res, 'Autenticação requerida');

    const payload = this.validateSchema(
      UpdateResponsibleGamblingDTO,
      req.body as UpdateResponsibleGamblingDTOType,
    ) as UpdateResponsibleGamblingDTOType;
    const profile = await this.updateResponsibleGamblingUseCase.execute(userId, payload);
    return this.ok(res, { profile });
  }
}