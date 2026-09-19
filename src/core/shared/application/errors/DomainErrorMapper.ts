import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';

/**
 * Mapa canônico de código de domínio → status HTTP usado pelos módulos ao
 * converter um DomainError de fronteira (regra de negócio violada) num
 * AppError serializável pela camada HTTP.
 */
export type DomainErrorStatusMap = Record<string, number>;

export const mapDomainErrorToAppError = (
  error: DomainError,
  statusMap: DomainErrorStatusMap,
  defaultStatus = 400,
): AppError => new AppError(error.code, error.message, statusMap[error.code] ?? defaultStatus, error.details);

export const rethrowDomainError = <T extends DomainErrorStatusMap>(
  error: unknown,
  statusMap: T,
  defaultStatus = 400,
): never => {
  if (error instanceof DomainError) {
    throw mapDomainErrorToAppError(error, statusMap, defaultStatus);
  }
  throw error;
};

export const executeWithDomainErrorMapping = async <T, M extends DomainErrorStatusMap>(
  operation: () => Promise<T>,
  statusMap: M,
  defaultStatus = 400,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    rethrowDomainError(error, statusMap, defaultStatus);
    throw error;
  }
};