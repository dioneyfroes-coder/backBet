import { isRetryableTransactionError } from '../retryableTransactionError';

describe('isRetryableTransactionError', () => {
  it('reconhece TransientTransactionError (WriteConflict 112)', () => {
    const error = Object.assign(new Error('Write conflict'), {
      code: 112,
      codeName: 'WriteConflict',
      errorLabels: ['TransientTransactionError'],
    });
    expect(isRetryableTransactionError(error)).toBe(true);
  });

  it('reconhece UnknownTransactionCommitResult', () => {
    const error = Object.assign(new Error('commit uncertain'), {
      errorLabels: ['UnknownTransactionCommitResult'],
    });
    expect(isRetryableTransactionError(error)).toBe(true);
  });

  it('ignora erros sem errorLabels (ex.: AppError, erro genérico)', () => {
    expect(isRetryableTransactionError(new Error('db down'))).toBe(false);
    expect(isRetryableTransactionError({ code: 11000 })).toBe(false);
  });

  it('ignora labels não relacionadas a transação', () => {
    const error = Object.assign(new Error('other'), { errorLabels: ['SomethingElse'] });
    expect(isRetryableTransactionError(error)).toBe(false);
  });

  it('ignora valores não-objeto', () => {
    expect(isRetryableTransactionError(undefined)).toBe(false);
    expect(isRetryableTransactionError(null)).toBe(false);
    expect(isRetryableTransactionError('WriteConflict')).toBe(false);
  });
});
