import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';
import {
  DomainErrorStatusMap,
  mapDomainErrorToAppError,
  rethrowDomainError,
  executeWithDomainErrorMapping,
} from '@/core/shared/application/errors/DomainErrorMapper';

const ERROR_STATUS_MAP: DomainErrorStatusMap = {
  EVENT_NOT_FOUND: 404,
  MARKET_NOT_FOUND: 404,
  ODD_NOT_FOUND: 404,
  BET_NOT_FOUND: 404,
  EVENT_NOT_OPEN_FOR_BETTING: 400,
  EVENT_NOT_CANCELABLE: 400,
  MARKET_NOT_OPEN_FOR_BETTING: 400,
  ODD_CHANGED: 409,
  BET_NOT_PENDING: 400,
  BET_NOT_OWNER: 403,
  MARKET_NOT_OPEN: 400,
  MARKET_SUSPENDED: 400,
  MARKET_CLOSED: 400,
  EVENT_NOT_SCHEDULED: 400,
  EVENT_NOT_LIVE: 400,
  EVENT_FINISHED: 400,
  EVENT_ALREADY_CANCELED: 400,
  WALLET_ALREADY_EXISTS: 409,
  WALLET_NOT_FOUND: 404,
  WALLET_INVALID_AMOUNT: 400,
  WALLET_INSUFFICIENT_FUNDS: 400,
  WALLET_LOCKED_BALANCE_EXCEEDED: 400,
  WALLET_INSUFFICIENT_LOCKED_FUNDS: 400,
  MONEY_INVALID_AMOUNT: 400,
  MONEY_INVALID_CURRENCY: 400,
  MONEY_CURRENCY_MISMATCH: 400,
  MONEY_NEGATIVE_RESULT: 400,
  MONEY_NEGATIVE_FACTOR: 400,
  CURRENCY_INVALID_CODE: 400,
  RESPONSIBLE_GAMBLING_SELF_EXCLUDED: 403,
  RESPONSIBLE_GAMBLING_TIME_OUT_ACTIVE: 403,
  RESPONSIBLE_GAMBLING_BET_LIMIT_EXCEEDED: 403,
  RESPONSIBLE_GAMBLING_INVALID_DATE: 400,
};

export const mapBetDomainError = (error: DomainError): AppError =>
  mapDomainErrorToAppError(error, ERROR_STATUS_MAP);

export const rethrowBetDomainError = (error: unknown): never =>
  rethrowDomainError(error, ERROR_STATUS_MAP);

export const executeWithBetErrorMapping = async <T>(operation: () => Promise<T>): Promise<T> =>
  executeWithDomainErrorMapping(operation, ERROR_STATUS_MAP);
