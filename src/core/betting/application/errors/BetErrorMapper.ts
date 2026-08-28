import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';

const ERROR_STATUS_MAP: Record<string, number> = {
  EVENT_NOT_FOUND: 404,
  MARKET_NOT_FOUND: 404,
  ODD_NOT_FOUND: 404,
  BET_NOT_FOUND: 404,
  EVENT_NOT_OPEN_FOR_BETTING: 400,
  EVENT_NOT_CANCELABLE: 400,
  MARKET_NOT_OPEN_FOR_BETTING: 400,
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
};

export const mapBetDomainError = (error: DomainError): AppError => {
  const status = ERROR_STATUS_MAP[error.code] ?? 400;
  return new AppError(error.code, error.message, status, error.details);
};

export const rethrowBetDomainError = (error: unknown): never => {
  if (error instanceof DomainError) {
    throw mapBetDomainError(error);
  }
  throw error;
};

export const executeWithBetErrorMapping = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    rethrowBetDomainError(error);
    throw error;
  }
};
