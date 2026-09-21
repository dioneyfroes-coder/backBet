import { ISessionRepository } from './ISessionRepository';
import { Session } from '../entities/Session';

/**
 * Espelha a semântica de snapshot do Mongo: cada gravação persiste uma CÓPIA
 * defensiva do objeto de domínio. Mutar o objeto recebido (ex.: session.rotate()
 * dentro do service) NÃO altera o estado persistido até um novo update() — é
 * isso que torna o guard do rotateWithGuard fiel ao comportamento do banco.
 */
export class InMemorySessionRepository implements ISessionRepository {
  private readonly sessions = new Map<string, Session>();

  private static snapshot(session: Session): Session {
    return new Session(
      session.sessionId,
      session.userId,
      session.jwtId,
      session.status,
      new Date(session.createdAt),
      new Date(session.lastUsedAt),
      new Date(session.expiresAt),
      session.revokedAt ? new Date(session.revokedAt) : undefined,
      session.revokedReason,
    );
  }

  async findById(sessionId: string): Promise<Session | null> {
    const stored = this.sessions.get(sessionId);
    return stored ? InMemorySessionRepository.snapshot(stored) : null;
  }

  async findByUserId(userId: string): Promise<Session[]> {
    return Array.from(this.sessions.values())
      .filter((s) => s.userId === userId)
      .map((s) => InMemorySessionRepository.snapshot(s));
  }

  async create(session: Session): Promise<void> {
    this.sessions.set(session.sessionId, InMemorySessionRepository.snapshot(session));
  }

  async update(session: Session): Promise<void> {
    this.sessions.set(session.sessionId, InMemorySessionRepository.snapshot(session));
  }

  async rotateWithGuard(
    sessionId: string,
    expectedJti: string,
    newSession: Session,
  ): Promise<boolean> {
    // Sem `await` no meio: get + check + set são atômicos no event loop (JS).
    const current = this.sessions.get(sessionId);
    if (!current || current.status !== 'ACTIVE' || current.jwtId !== expectedJti) {
      return false;
    }
    this.sessions.set(sessionId, InMemorySessionRepository.snapshot(newSession));
    return true;
  }

  async deleteByUserId(userId: string): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(sessionId);
      }
    }
  }
}