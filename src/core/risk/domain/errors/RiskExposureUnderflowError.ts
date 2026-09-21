import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { RiskExposureScope } from '@/core/risk/types/risk.types';

export const RISK_EXPOSURE_UNDERFLOW = 'RISK_EXPOSURE_UNDERFLOW';

export type RiskExposureUnderflowScope = 'USER' | RiskExposureScope;

export type RiskExposureUnderflowDetails = {
  scope: RiskExposureUnderflowScope;
  refId: string;
  requestedCents: number;
  currentCents: number;
  /** false quando nem existia o registro de exposição (perfil/contador). */
  recordExists?: boolean;
};

/**
 * Sinaliza uma inconsistência: tentou-se reduzir mais exposição do que a
 * registrada. Não deve ser mascarado com clamp em zero — a exposição negativa
 * esconderia o problema. O chamador (RiskService) registra métrica/log e o job
 * de reconciliação é o caminho de correção.
 */
export class RiskExposureUnderflowError extends DomainError {
  constructor(details: RiskExposureUnderflowDetails) {
    super({
      code: RISK_EXPOSURE_UNDERFLOW,
      message: `Exposição insuficiente para redução: atual=${details.currentCents}, solicitado=${details.requestedCents}`,
      details: details as unknown as Record<string, unknown>,
    });
    this.name = 'RiskExposureUnderflowError';
  }
}

export const isRiskExposureUnderflow = (
  error: unknown,
): error is RiskExposureUnderflowError =>
  error instanceof RiskExposureUnderflowError ||
  (error instanceof DomainError && error.code === RISK_EXPOSURE_UNDERFLOW);
