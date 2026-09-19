import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';
import {
  DomainErrorStatusMap,
  mapDomainErrorToAppError,
  rethrowDomainError,
  executeWithDomainErrorMapping,
} from '@/core/shared/application/errors/DomainErrorMapper';

const ERROR_STATUS_MAP: DomainErrorStatusMap = {
  SIGAP_NOT_ENABLED: 503,
  SIGAP_TRANSMISSION_FAILED: 502,
};

export const mapSigapDomainError = (error: DomainError): AppError =>
  mapDomainErrorToAppError(error, ERROR_STATUS_MAP);

export const rethrowSigapDomainError = (error: unknown): never =>
  rethrowDomainError(error, ERROR_STATUS_MAP);

export const executeWithSigapErrorMapping = async <T>(operation: () => Promise<T>): Promise<T> =>
  executeWithDomainErrorMapping(operation, ERROR_STATUS_MAP);