import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';

const ERROR_STATUS_MAP: Record<string, number> = {
  RESPONSIBLE_GAMBLING_SELF_EXCLUDED: 403,
  RESPONSIBLE_GAMBLING_TIME_OUT_ACTIVE: 403,
  RESPONSIBLE_GAMBLING_DEPOSIT_LIMIT_EXCEEDED: 403,
  RESPONSIBLE_GAMBLING_BET_LIMIT_EXCEEDED: 403,
  RESPONSIBLE_GAMBLING_INVALID_DATE: 400,
  RESPONSIBLE_GAMBLING_INVALID_LIMIT: 400,
};

export const mapResponsibleGamblingDomainError = (error: DomainError): AppError => {
  const status = ERROR_STATUS_MAP[error.code] ?? 400;
  return new AppError(error.code, error.message, status, error.details);
};

export const rethrowResponsibleGamblingDomainError = (error: unknown): never => {
  if (error instanceof DomainError) {
    throw mapResponsibleGamblingDomainError(error);
  }
  throw error;
};

export const executeWithResponsibleGamblingErrorMapping = async <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    rethrowResponsibleGamblingDomainError(error);
    throw error;
  }
};