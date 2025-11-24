import jwt from 'jsonwebtoken';
import { AppError } from '@/shared/errors/AppError';
import { appConfig } from '@/shared/config/appConfig';

export type JwtKind = 'access' | 'refresh';

export interface JwtPayload {
  userId: string;
  sessionId: string;
  kind: JwtKind;
}

export class JwtService {
  constructor(private readonly config = appConfig.jwt) {}

  signAccessToken(userId: string, sessionId: string): string {
    return this.signToken({ userId, sessionId, kind: 'access' }, this.config.accessTokenExpiration);
  }

  signRefreshToken(userId: string, sessionId: string): string {
    return this.signToken(
      { userId, sessionId, kind: 'refresh' },
      this.config.refreshTokenExpiration,
    );
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.verifyToken(token, 'access');
  }

  verifyRefreshToken(token: string): JwtPayload {
    return this.verifyToken(token, 'refresh');
  }

  private signToken(payload: JwtPayload, expiresIn: string): string {
    const options: jwt.SignOptions = {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
      issuer: this.config.issuer,
    };

    return jwt.sign(payload, this.config.secret as jwt.Secret, options);
  }

  private verifyToken(token: string, expectedKind: JwtKind): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.config.secret) as JwtPayload;
      if (decoded.kind !== expectedKind) {
        throw new AppError('UNAUTHORIZED', 'Token inválido', 401);
      }
      return decoded;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('UNAUTHORIZED', 'Token inválido ou expirado', 401);
    }
  }
}
