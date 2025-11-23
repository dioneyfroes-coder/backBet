import { DomainError } from '../DomainError';

describe('DomainError', () => {
  it('sets defaults and preserves details', () => {
    const error = new DomainError({ message: 'failure', details: { foo: 'bar' } });

    expect(error.code).toBe('DOMAIN_ERROR');
    expect(error.details).toEqual({ foo: 'bar' });
    expect(error.name).toBe('DomainError');
  });

  it('uses provided code', () => {
    const error = new DomainError({ code: 'CUSTOM', message: 'boom' });

    expect(error.code).toBe('CUSTOM');
  });
});
