import { Session } from '../entities/Session';

export interface ISessionRepository {
  findById(sessionId: string): Promise<Session | null>;
  findByUserId(userId: string): Promise<Session[]>;
  create(session: Session): Promise<void>;
  update(session: Session): Promise<void>;
  /**
   * Rotação de refresh token com condição atômica (CAS — item #5 do plano).
   * Só aplica a rotação se a sessão ainda estiver ACTIVE E jwtId === expectedJti.
   * Retorna true se 1 documento foi atualizado; false se o guard falhou
   * (sessão inexistente/revogada ou já rotacionada por outra requisição).
   */
  rotateWithGuard(sessionId: string, expectedJti: string, newSession: Session): Promise<boolean>;
  deleteByUserId(userId: string): Promise<void>;
}