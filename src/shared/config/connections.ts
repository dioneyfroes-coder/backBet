import { env } from './env';

/**
 * Fonte única de configuração de conexões Mongo/Redis.
 *
 * O .env define MONGODB_URI e REDIS_URL completas (host + banco + autenticação).
 * Nenhum módulo da aplicação reconstroi credenciais/URIs por conta própria: todos
 * devem ler daqui.
 *
 * Não há endpoint padrão: se a variável faltar, o erro de configuração aparece
 * imediatamente em vez de tentar conectar em localhost (problemático dentro de
 * container). Os únicos defaults remanescentes são os de ambiente de teste do
 * env.ts, usados exclusivamente pelos testes unitários locais (Jest).
 *
 * Para a suíte de integração, o database é trocado explicitamente via
 * MONGODB_TEST_DB (configuração de teste), mantendo host/auth/porta do .env.
 */

export function getMongoUri(): string {
  if (!env.MONGODB_URI) {
    throw new Error('[config] MONGODB_URI é obrigatória — defina no .env (ex.: mongodb://backbet:...@mongodb:27017/backbet?authSource=admin&replicaSet=rs0).');
  }
  return env.MONGODB_URI;
}

export function getRedisUrl(): string {
  if (!env.REDIS_URL) {
    throw new Error('[config] REDIS_URL é obrigatória — defina no .env (ex.: redis://:senha@redis:6379).');
  }
  return env.REDIS_URL;
}

export function dbNameFromUri(uri: string): string {
  try {
    const pathname = new URL(uri).pathname;
    const segment = pathname.replace(/^\/+/, '').split('/')[0];
    return segment || '';
  } catch {
    return '';
  }
}

export function getMongoDbName(): string {
  if (env.MONGODB_DB_NAME) return env.MONGODB_DB_NAME;
  return dbNameFromUri(getMongoUri());
}