import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';

const ERROR_STATUS_MAP: Record<string, number> = {
  SIGAP_NOT_ENABLED: 503,
  SIGAP_TRANSMISSION_FAILED: 502,
};

export const mapSigapDomainError = (error: DomainError): AppError => {
  const status = ERROR_STATUS_MAP[error.code] ?? 400;
  return new AppError(error.code, error.message, status, error.details);
};

export const rethrowSigapDomainError = (error: unknown): never => {
  if (error instanceof DomainError) {
    throw mapSigapDomainError(error);
  }
  throw error;
};

export const executeWithSigapErrorMapping = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    rethrowSigapDomainError(error);
    throw error;
  }
};
