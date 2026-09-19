import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';
import {
  DomainErrorStatusMap,
  mapDomainErrorToAppError,
  rethrowDomainError,
  executeWithDomainErrorMapping,
} from '@/core/shared/application/errors/DomainErrorMapper';

const ERROR_STATUS_MAP: DomainErrorStatusMap = {
  RESPONSIBLE_GAMBLING_SELF_EXCLUDED: 403,
  RESPONSIBLE_GAMBLING_TIME_OUT_ACTIVE: 403,
  RESPONSIBLE_GAMBLING_DEPOSIT_LIMIT_EXCEEDED: 403,
  RESPONSIBLE_GAMBLING_BET_LIMIT_EXCEEDED: 403,
  RESPONSIBLE_GAMBLING_INVALID_DATE: 400,
  RESPONSIBLE_GAMBLING_INVALID_LIMIT: 400,
};

export const mapResponsibleGamblingDomainError = (error: DomainError): AppError =>
  mapDomainErrorToAppError(error, ERROR_STATUS_MAP);

export const rethrowResponsibleGamblingDomainError = (error: unknown): never =>
  rethrowDomainError(error, ERROR_STATUS_MAP);

export const executeWithResponsibleGamblingErrorMapping = async <T>(
  operation: () => Promise<T>,
): Promise<T> => executeWithDomainErrorMapping(operation, ERROR_STATUS_MAP);