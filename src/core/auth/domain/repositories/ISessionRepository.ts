import { Session } from '../entities/Session';

export interface ISessionRepository {
  findById(sessionId: string): Promise<Session | null>;
  findByUserId(userId: string): Promise<Session[]>;
  create(session: Session): Promise<void>;
  update(session: Session): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
}