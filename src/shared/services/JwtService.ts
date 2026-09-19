import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { AppError } from '@/shared/errors/AppError';
import { appConfig } from '@/shared/config/appConfig';

export type JwtKind = 'access' | 'refresh';

export interface JwtPayload {
  userId: string;
  sessionId: string;
  kind: JwtKind;
  jti?: string;
}

export interface JwtConfig {
  secret: string;
  issuer: string;
  audience?: string;
  accessSecret?: string;
  refreshSecret?: string;
  accessTokenExpiration: string;
  refreshTokenExpiration: string;
}

export class JwtService {
  constructor(private readonly config: JwtConfig = appConfig.jwt) {}

  signAccessToken(userId: string, sessionId: string): string {
    return this.signToken(
      { userId, sessionId, kind: 'access', jti: randomUUID() },
      this.accessSecret(),
      this.config.accessTokenExpiration,
    );
  }

  /**
   * @param jti Identificador do refresh token (persistido na sessão para
   * detecção de rotação/reutilização). Gerado automaticamente se omitido.
   */
  signRefreshToken(userId: string, sessionId: string, jti?: string): string {
    return this.signToken(
      { userId, sessionId, kind: 'refresh', jti: jti || randomUUID() },
      this.refreshSecret(),
      this.config.refreshTokenExpiration,
    );
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.verifyToken(token, this.accessSecret(), 'access');
  }

  verifyRefreshToken(token: string): JwtPayload {
    return this.verifyToken(token, this.refreshSecret(), 'refresh');
  }

  // Separations de segredo por kind: acesso concedido por um secret, refresh
  // com outro. Se não configurados, caem no JWT_SECRET legado.
  private accessSecret(): string {
    return this.config.accessSecret || this.config.secret;
  }

  private refreshSecret(): string {
    return this.config.refreshSecret || this.config.secret;
  }

  private signToken(payload: JwtPayload, secret: string, expiresIn: string): string {
    const options: jwt.SignOptions = {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
      issuer: this.config.issuer,
    };
    if (this.config.audience) {
      options.audience = this.config.audience;
    }

    return jwt.sign(payload, secret as jwt.Secret, options);
  }

  private verifyToken(token: string, secret: string, expectedKind: JwtKind): JwtPayload {
    try {
      const options: jwt.VerifyOptions = { issuer: this.config.issuer };
      if (this.config.audience) {
        options.audience = this.config.audience;
      }
      const decoded = jwt.verify(token, secret, options) as JwtPayload;
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