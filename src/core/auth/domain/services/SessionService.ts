import { randomUUID } from 'crypto';
import { Session } from '../entities/Session';
import { ISessionRepository } from '../repositories/ISessionRepository';
import { AppError } from '@/shared/errors/AppError';

/**
 * Ciclo de vida das sessões de refresh token (Fase 9).
 *
 * - openSession: cria e persiste uma sessão quando um novo par de tokens é emitido.
 * - rotate (refresh rotation): o refresh token usado é substituído por um novo;
 *   a rotação é atômica (CAS no repositório): se o jti apresentado não for o
 *   vigente — replay de token antigo/roubado ou uso concorrente do MESMO token —
 *   a família é revogada imediatamente (detecção de reutilização).
 * - revoke / revokeAllForUser: logout e suspensão de conta.
 * - assertActiveSession: gate usado pelo protectedRoute para invalidar de
 *   imediato tokens emitidos antes de logout/suspensão.
 */
export class SessionService {
  constructor(
    private readonly repository: ISessionRepository,
    private readonly ttlMs = 7 * 24 * 60 * 60 * 1000,
  ) {}

  async openSession(userId: string): Promise<Session> {
    const session = new Session(
      randomUUID(),
      userId,
      randomUUID(),
      'ACTIVE',
      new Date(),
      new Date(),
      new Date(Date.now() + this.ttlMs),
    );
    await this.repository.create(session);
    return session;
  }

  async rotate(userId: string, sessionId: string, presentedJti?: string): Promise<Session> {
    const session = await this.repository.findById(sessionId);
    if (!session || !session.isActive()) {
      throw new AppError(
        'UNAUTHORIZED',
        session && session.status === 'REVOKED'
          ? 'Sessão revogada. Faça login novamente.'
          : 'Sessão inválida ou encerrada. Faça login novamente.',
        401,
      );
    }
    if (session.userId !== userId) {
      throw new AppError('UNAUTHORIZED', 'Sessão inválida', 401);
    }
    if (session.isExpired()) {
      session.revoke('EXPIRED');
      await this.repository.update(session);
      throw new AppError('UNAUTHORIZED', 'Refresh token expirado. Faça login novamente.', 401);
    }

    // Rotação insegura: o jti apresentado não é o vigente → token reutilizado
    // (replay de token antigo ou roubado). Revoga a família inteira.
    if (presentedJti && session.jwtId !== presentedJti) {
      session.revoke('REUSE_DETECTED');
      await this.repository.update(session);
      throw new AppError(
        'UNAUTHORIZED',
        'Refresh token reutilizado. Sessão revogada por segurança. Faça login novamente.',
        401,
        { sessionId },
      );
    }

    const newJti = randomUUID();
    session.rotate(newJti);

    // CAS atômico (item #5 do plano): a rotação só é aplicada se a sessão
    // continuar ACTIVE com EXATAMENTE este jwtId. Sem isso, duas requisições
    // concorrentes com o MESMO refresh token venceriam e o replay deixaria de
    // ser detectado. Aqui, o perdedor do CAS é tratado como reuse: a família
    // inteira é revogada por segurança.
    if (presentedJti) {
      const applied = await this.repository.rotateWithGuard(
        session.sessionId,
        presentedJti,
        session,
      );
      if (!applied) {
        const latest = await this.repository.findById(session.sessionId);
        if (latest && latest.isActive()) {
          latest.revoke('REUSE_DETECTED');
          await this.repository.update(latest);
        }
        throw new AppError(
          'UNAUTHORIZED',
          'Refresh token reutilizado. Sessão revogada por segurança. Faça login novamente.',
          401,
          { sessionId },
        );
      }
      return session;
    }

    await this.repository.update(session);
    return session;
  }

  async revoke(sessionId: string): Promise<void> {
    const session = await this.repository.findById(sessionId);
    if (!session || !session.isActive()) {
      return;
    }
    session.revoke('LOGOUT');
    await this.repository.update(session);
  }

  async revokeOwnSession(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.repository.findById(sessionId);
    if (!session || session.userId !== userId) {
      return false;
    }
    if (session.isActive()) {
      session.revoke('LOGOUT');
      await this.repository.update(session);
    }
    return true;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const sessions = await this.repository.findByUserId(userId);
    for (const session of sessions) {
      if (session.isActive()) {
        session.revoke('ACCOUNT_STATUS_CHANGED');
        await this.repository.update(session);
      }
    }
  }

  async findSession(sessionId: string): Promise<Session | null> {
    return this.repository.findById(sessionId);
  }

  async assertActiveSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.repository.findById(sessionId);
    if (!session || !session.isActive() || session.userId !== userId || session.isExpired()) {
      throw new AppError('UNAUTHORIZED', 'Sessão inválida ou encerrada. Faça login novamente.', 401);
    }
    session.touched();
    await this.repository.update(session);
  }
}