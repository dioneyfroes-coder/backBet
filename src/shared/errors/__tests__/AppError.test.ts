import { AppError } from '../AppError';

describe('AppError', () => {
  it('preserves metadata and stack information', () => {
    const error = new AppError('BAD_REQUEST', 'Invalid payload', 400, { field: 'email' });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ field: 'email' });
    expect(error.stack).toContain('AppError');
  });

  it('falls back to defaults when optional values are missing', () => {
    const error = new AppError('UNKNOWN', 'Something went wrong');

    expect(error.statusCode).toBe(500);
    expect(error.details).toBeUndefined();
    expect(error.message).toBe('Something went wrong');
  });
});
