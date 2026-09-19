import { SessionService } from './SessionService';
import { InMemorySessionRepository } from '../repositories/InMemorySessionRepository';
import { ISessionRepository } from '../repositories/ISessionRepository';

export type SessionRepositoryResolver = () => Promise<ISessionRepository>;

/**
 * Resolve o repositório de sessões usadas pelo singleton. O default é o
 * repositório atômico (testes/hermético); a infraestrutura registra o resolver
 * definitivo (Mongoose/Redis) via `setSessionRepositoryResolver` durante o
 * bootstrap, sem que o core conheça a implementação concreta.
 */
let sessionRepositoryResolver: SessionRepositoryResolver = async () =>
  new InMemorySessionRepository();

export function setSessionRepositoryResolver(resolver: SessionRepositoryResolver): void {
  sessionRepositoryResolver = resolver;
}

let sessionServicePromise: Promise<SessionService> | null = null;

/**
 * Singleton global usado por AuthController (emissão/rotação), pelo gate do
 * protectedRoute (validação por requisição) e por suspensão/logout (revogação).
 */
export function getSessionService(): Promise<SessionService> {
  if (!sessionServicePromise) {
    sessionServicePromise = sessionRepositoryResolver().then(
      (repository) => new SessionService(repository),
    );
  }
  return sessionServicePromise;
}

export function resetSessionServiceForTests(): void {
  sessionServicePromise = null;
}