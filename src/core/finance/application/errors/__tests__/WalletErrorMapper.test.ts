import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';
import {
  executeWithWalletErrorMapping,
  mapWalletDomainError,
  rethrowWalletDomainError,
} from '../WalletErrorMapper';

describe('WalletErrorMapper', () => {
  it('returns mapped status for known wallet codes', () => {
    const error = new DomainError({ code: 'WALLET_NOT_FOUND', message: 'missing' });

    const mapped = mapWalletDomainError(error);

    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.statusCode).toBe(404);
  });

  it('defaults to 400 for unknown codes', () => {
    const error = new DomainError({ code: 'UNKNOWN', message: 'boom' });

    const mapped = mapWalletDomainError(error);

    expect(mapped.statusCode).toBe(400);
  });

  it('rethrows domain error as AppError and passes through others', async () => {
    const domainError = new DomainError({ code: 'WALLET_INVALID_AMOUNT', message: 'bad' });
    await expect(
      executeWithWalletErrorMapping(async () => {
        throw domainError;
      }),
    ).rejects.toMatchObject({ code: 'WALLET_INVALID_AMOUNT', statusCode: 400 });

    const plainError = new Error('plain');
    expect(() => rethrowWalletDomainError(plainError)).toThrow(plainError);
  });

  it('returns result when operation succeeds', async () => {
    const result = await executeWithWalletErrorMapping(async () => 'ok');

    expect(result).toBe('ok');
  });
});
