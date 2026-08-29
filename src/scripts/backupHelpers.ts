export function resolveMongoUri(): string {
  return process.env.MONGODB_URI ?? 'mongodb://localhost:27017/backbet-test';
}

export function defaultDbNameFromUri(uri: string): string {
  try {
    const pathname = new URL(uri).pathname;
    const segment = pathname.replace(/^\/+/, '').split('/')[0];
    return segment || 'backbet-test';
  } catch {
    return 'backbet-test';
  }
}