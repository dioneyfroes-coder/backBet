import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';
import {
  executeWithBetErrorMapping,
  mapBetDomainError,
  rethrowBetDomainError,
} from '../BetErrorMapper';

describe('BetErrorMapper', () => {
  it('maps known domain errors to AppError with mapped status', () => {
    const domainError = new DomainError({ code: 'EVENT_NOT_FOUND', message: 'missing' });

    const appError = mapBetDomainError(domainError);

    expect(appError).toBeInstanceOf(AppError);
    expect(appError.statusCode).toBe(404);
    expect(appError.code).toBe('EVENT_NOT_FOUND');
  });

  it('defaults to 400 for unknown domain codes', () => {
    const domainError = new DomainError({ code: 'SOMETHING_ELSE', message: 'boom' });

    const appError = mapBetDomainError(domainError);

    expect(appError.statusCode).toBe(400);
  });

  it('rethrows mapped errors when executeWithBetErrorMapping fails', async () => {
    const domainError = new DomainError({ code: 'BET_NOT_FOUND', message: 'nope' });

    await expect(
      executeWithBetErrorMapping(async () => {
        throw domainError;
      }),
    ).rejects.toMatchObject({ code: 'BET_NOT_FOUND', statusCode: 404 });
  });

  it('passes through non-domain errors', () => {
    const error = new Error('plain');

    expect(() => rethrowBetDomainError(error)).toThrow(error);
  });

  it('executes the happy path operation without touching rethrow', async () => {
    const result = await executeWithBetErrorMapping(async () => 42);

    expect(result).toBe(42);
  });
});
