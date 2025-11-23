import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';

const ERROR_STATUS_MAP: Record<string, number> = {
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

export const mapWalletDomainError = (error: DomainError): AppError => {
  const status = ERROR_STATUS_MAP[error.code] ?? 400;
  return new AppError(error.code, error.message, status, error.details);
};

export const rethrowWalletDomainError = (error: unknown): never => {
  if (error instanceof DomainError) {
    throw mapWalletDomainError(error);
  }
  throw error;
};

export const executeWithWalletErrorMapping = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    rethrowWalletDomainError(error);
    throw error;
  }
};
