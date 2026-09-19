import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';
import {
  DomainErrorStatusMap,
  mapDomainErrorToAppError,
  rethrowDomainError,
  executeWithDomainErrorMapping,
} from '@/core/shared/application/errors/DomainErrorMapper';

const ERROR_STATUS_MAP: DomainErrorStatusMap = {
  TREASURY_INVALID_AMOUNT: 400,
  TREASURY_INSUFFICIENT_PROFIT: 400,
  TREASURY_INSUFFICIENT_PRIZE_RESERVE: 400,
  TREASURY_INVALID_RATIO: 400,
  TREASURY_INVALID_BUFFER: 400,
  MONEY_INVALID_AMOUNT: 400,
  MONEY_INVALID_CURRENCY: 400,
  MONEY_CURRENCY_MISMATCH: 400,
};

export const mapTreasuryError = (error: DomainError): AppError =>
  mapDomainErrorToAppError(error, ERROR_STATUS_MAP);

export const rethrowTreasuryError = (error: unknown): never =>
  rethrowDomainError(error, ERROR_STATUS_MAP);

export const executeWithTreasuryErrorMapping = async <T>(op: () => Promise<T>): Promise<T> =>
  executeWithDomainErrorMapping(op, ERROR_STATUS_MAP);