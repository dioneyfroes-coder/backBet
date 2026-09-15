import { dbNameFromUri, getMongoUri } from '@/shared/config/connections';

export function resolveMongoUri(): string {
  return getMongoUri();
}

export function defaultDbNameFromUri(uri: string): string {
  return dbNameFromUri(uri) || 'backbet-test';
}