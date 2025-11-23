import { JwtService } from '../JwtService';
import { AppError } from '@/shared/errors/AppError';

describe('JwtService', () => {
  const config = {
    secret: 'test-secret',
    issuer: 'backbet',
    accessTokenExpiration: '1h',
    refreshTokenExpiration: '7d',
  };

  it('signs and verifies access tokens', () => {
    const service = new JwtService(config);
    const token = service.signAccessToken('user-1', 'session-1');

    expect(service.verifyAccessToken(token)).toMatchObject({ userId: 'user-1', kind: 'access' });
  });

  it('signs and verifies refresh tokens', () => {
    const service = new JwtService(config);
    const token = service.signRefreshToken('user-1', 'session-1');

    expect(service.verifyRefreshToken(token)).toMatchObject({ kind: 'refresh' });
  });

  it('rejects tokens when kind does not match the verifier', () => {
    const service = new JwtService(config);
    const refresh = service.signRefreshToken('user-1', 'session-1');

    expect(() => service.verifyAccessToken(refresh)).toThrow(AppError);
  });

  it('wraps jwt verification errors into AppError', () => {
    const service = new JwtService(config);

    expect(() => service.verifyAccessToken('invalid')).toThrow('Token inválido ou expirado');
  });
});
