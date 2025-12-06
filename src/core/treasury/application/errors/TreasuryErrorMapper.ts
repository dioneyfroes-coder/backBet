import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';

const ERROR_MAP: Record<string, number> = {
  TREASURY_INVALID_AMOUNT: 400,
  TREASURY_INSUFFICIENT_PROFIT: 400,
  TREASURY_INSUFFICIENT_PRIZE_RESERVE: 400,
  TREASURY_INVALID_RATIO: 400,
  TREASURY_INVALID_BUFFER: 400,
  MONEY_INVALID_AMOUNT: 400,
  MONEY_INVALID_CURRENCY: 400,
  MONEY_CURRENCY_MISMATCH: 400,
};

export const mapTreasuryError = (error: DomainError): AppError => {
  const status = ERROR_MAP[error.code] ?? 400;
  return new AppError(error.code, error.message, status, error.details);
};

export const rethrowTreasuryError = (error: unknown): never => {
  if (error instanceof DomainError) {
    throw mapTreasuryError(error);
  }
  throw error;
};

export const executeWithTreasuryErrorMapping = async <T>(op: () => Promise<T>): Promise<T> => {
  try {
    return await op();
  } catch (error) {
    rethrowTreasuryError(error);
    throw error;
  }
};
