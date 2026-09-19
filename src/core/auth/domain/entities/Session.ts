export type SessionStatus = 'ACTIVE' | 'REVOKED';

export interface ISession {
  sessionId: string;
  userId: string;
  jwtId: string;
  status: SessionStatus;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
}

export class Session {
  constructor(
    public readonly sessionId: string,
    public readonly userId: string,
    public jwtId: string,
    public status: SessionStatus = 'ACTIVE',
    public readonly createdAt: Date = new Date(),
    public lastUsedAt: Date = new Date(),
    public readonly expiresAt: Date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    public revokedAt?: Date,
    public revokedReason?: string,
  ) {}

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  isExpired(now: Date = new Date()): boolean {
    return this.expiresAt.getTime() < now.getTime();
  }

  touched(now: Date = new Date()): void {
    this.lastUsedAt = now;
  }

  rotate(newJwtId: string, now: Date = new Date()): void {
    this.jwtId = newJwtId;
    this.lastUsedAt = now;
  }

  revoke(reason: string, now: Date = new Date()): void {
    this.status = 'REVOKED';
    this.revokedAt = now;
    this.revokedReason = reason;
  }
}