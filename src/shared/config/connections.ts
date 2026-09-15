import { env } from './env';

/**
 * Fonte única de configuração de conexões Mongo/Redis.
 *
 * O .env define MONGODB_URI e REDIS_URL completas (host + banco + autenticação).
 * Nenhum módulo da aplicação deve reconstruir credenciais/URIs por conta própria:
 * todos devem ler daqui.
 *
 * Para a suíte de integração, o database é trocado explicitamente via
 * MONGODB_TEST_DB (configuração de teste), mantendo host/auth/porta do .env.
 */

const DEFAULT_MONGO_URI = 'mongodb://localhost:27017/backbet-dev';
const DEFAULT_REDIS_URL = 'redis://localhost:6379';

export function getMongoUri(): string {
  return env.MONGODB_URI || DEFAULT_MONGO_URI;
}

export function getRedisUrl(): string {
  return env.REDIS_URL || DEFAULT_REDIS_URL;
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
  return env.MONGODB_DB_NAME || dbNameFromUri(getMongoUri()) || 'backbet-dev';
}