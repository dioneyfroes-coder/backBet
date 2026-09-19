import { JwtService } from '../JwtService';
import { AppError } from '@/shared/errors/AppError';
import jwt from 'jsonwebtoken';

describe('JwtService', () => {
  const config = {
    secret: 'test-secret',
    issuer: 'backbet',
    audience: 'backbet-api',
    accessTokenExpiration: '1h',
    refreshTokenExpiration: '7d',
  };

  it('signs and verifies access tokens', () => {
    const service = new JwtService(config);
    const token = service.signAccessToken('user-1', 'session-1');

    const payload = service.verifyAccessToken(token);
    expect(payload).toMatchObject({ userId: 'user-1', kind: 'access', sessionId: 'session-1' });
    expect(payload.jti).toBeTruthy();
  });

  it('signs and verifies refresh tokens', () => {
    const service = new JwtService(config);
    const token = service.signRefreshToken('user-1', 'session-1');

    expect(service.verifyRefreshToken(token)).toMatchObject({ kind: 'refresh' });
  });

  it('honours a provided jti in the refresh token', () => {
    const service = new JwtService(config);
    const token = service.signRefreshToken('user-1', 'session-1', 'fixed-jti');

    expect(service.verifyRefreshToken(token)).toMatchObject({ jti: 'fixed-jti' });
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

  it('validates the audience on verification', () => {
    const service = new JwtService(config);

    const noAudience = jwt.sign({ userId: 'u', sessionId: 's', kind: 'access' }, config.secret, {
      issuer: config.issuer,
      expiresIn: '1h',
    });
    expect(() => service.verifyAccessToken(noAudience)).toThrow('Token inválido ou expirado');
  });

  it('uses separate secrets per kind when provided', () => {
    const service = new JwtService({
      ...config,
      accessSecret: 'access-secret',
      refreshSecret: 'refresh-secret',
    });

    const access = service.signAccessToken('user-1', 'session-1');
    const refresh = service.signRefreshToken('user-1', 'session-1');

    expect(() => service.verifyAccessToken(refresh)).toThrow(AppError);
    expect(() => service.verifyRefreshToken(access)).toThrow(AppError);
    expect(service.verifyAccessToken(access).kind).toBe('access');
    expect(service.verifyRefreshToken(refresh).kind).toBe('refresh');
  });
});