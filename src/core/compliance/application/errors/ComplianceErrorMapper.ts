import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';
import {
  DomainErrorStatusMap,
  mapDomainErrorToAppError,
  rethrowDomainError,
  executeWithDomainErrorMapping,
} from '@/core/shared/application/errors/DomainErrorMapper';

const ERROR_STATUS_MAP: DomainErrorStatusMap = {
  COMPLIANCE_IDENTITY_REQUIRED: 403,
  COMPLIANCE_KYC_NOT_CONFIGURED: 503,
  COMPLIANCE_KYC_REJECTED: 400,
};

export const mapComplianceDomainError = (error: DomainError): AppError =>
  mapDomainErrorToAppError(error, ERROR_STATUS_MAP);

export const rethrowComplianceDomainError = (error: unknown): never =>
  rethrowDomainError(error, ERROR_STATUS_MAP);

export const executeWithComplianceErrorMapping = async <T>(
  operation: () => Promise<T>,
): Promise<T> => executeWithDomainErrorMapping(operation, ERROR_STATUS_MAP);