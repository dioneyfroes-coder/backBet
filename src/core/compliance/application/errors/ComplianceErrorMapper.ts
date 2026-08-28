import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';

const ERROR_STATUS_MAP: Record<string, number> = {
  COMPLIANCE_IDENTITY_REQUIRED: 403,
  COMPLIANCE_KYC_NOT_CONFIGURED: 503,
  COMPLIANCE_KYC_REJECTED: 400,
};

export const mapComplianceDomainError = (error: DomainError): AppError => {
  const status = ERROR_STATUS_MAP[error.code] ?? 400;
  return new AppError(error.code, error.message, status, error.details);
};

export const rethrowComplianceDomainError = (error: unknown): never => {
  if (error instanceof DomainError) {
    throw mapComplianceDomainError(error);
  }
  throw error;
};

export const executeWithComplianceErrorMapping = async <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    rethrowComplianceDomainError(error);
    throw error;
  }
};