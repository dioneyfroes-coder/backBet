import { SessionService } from './SessionService';
import { InMemorySessionRepository } from '../repositories/InMemorySessionRepository';
import { ISessionRepository } from '../repositories/ISessionRepository';

/**
 * Resolve o repositório de sessões só quando necessário para não carregar o
 * mongoose em ambiente de teste (mesmo padrão de lazy import da factory).
 * A decisão é tomada no momento do primeiro uso: o NODE_ENV=test (marcador
 * dos testes Jest) ou BACKBET_RUNTIME_ENV=test força o repositório atômico,
 * evitando que um `.env` de produção vaze para a suíte hermética.
 */
async function resolveSessionRepository(): Promise<ISessionRepository> {
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  const backbetRuntimeEnv = (process.env.BACKBET_RUNTIME_ENV || nodeEnv || 'development').toLowerCase();
  const isTestRuntime = nodeEnv === 'test' || backbetRuntimeEnv === 'test';
  const useMongooseStore = process.env.USE_MONGOOSE_PERSISTENCE === 'true' && !isTestRuntime;

  if (useMongooseStore) {
    const { MongooseSessionRepository } = await import(
      '@/infrastructure/persistence/mongoose/repositories/MongooseSessionRepository'
    );
    return new MongooseSessionRepository();
  }
  return new InMemorySessionRepository();
}

let sessionServicePromise: Promise<SessionService> | null = null;

/**
 * Singleton global usado por AuthController (emissão/rotação), pelo gate do
 * protectedRoute (validação por requisição) e por suspensão/logout (revogação).
 */
export function getSessionService(): Promise<SessionService> {
  if (!sessionServicePromise) {
    sessionServicePromise = resolveSessionRepository().then(
      (repository) => new SessionService(repository),
    );
  }
  return sessionServicePromise;
}