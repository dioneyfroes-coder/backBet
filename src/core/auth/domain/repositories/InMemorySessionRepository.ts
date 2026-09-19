import { ISessionRepository } from './ISessionRepository';
import { Session } from '../entities/Session';

export class InMemorySessionRepository implements ISessionRepository {
  private readonly sessions = new Map<string, Session>();

  async findById(sessionId: string): Promise<Session | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async findByUserId(userId: string): Promise<Session[]> {
    return Array.from(this.sessions.values()).filter((s) => s.userId === userId);
  }

  async create(session: Session): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }

  async update(session: Session): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }

  async deleteByUserId(userId: string): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(sessionId);
      }
    }
  }
}