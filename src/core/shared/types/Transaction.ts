export type TransactionSession = unknown;

export interface TransactionRunner {
  withTransaction<T>(work: (session: TransactionSession) => Promise<T>): Promise<T>;
}