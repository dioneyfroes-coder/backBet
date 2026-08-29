import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';

export const isInfraTransactionFailure = (error: unknown): boolean => {
  if (error instanceof DomainError) return false;
  if (error instanceof AppError) {
    return typeof error.statusCode !== 'number' || error.statusCode >= 500;
  }
  return true;
};