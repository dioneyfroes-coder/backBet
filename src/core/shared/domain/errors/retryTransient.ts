import { AppError } from '@/shared/errors/AppError';

/**
 * ERROS DE CONCORRÊNCIA TRANSITÓRIOS — candidatos a re-executar a unidade
 * atômica inteira (a mutação em si não ocorreu; foi abortada pela transação):
 *
 * - `AppError CONFLICT`: optimistic lock da aplicação (versão obsoleta).
 * - `MongoServerError 112` (+ labels `TransientTransactionError` /
 *   `UnknownTransactionCommitResult`): write conflict do WiredTiger em
 *   transação; sob concorrência alta, duas transações que gravam o mesmo
 *   documento abortam ANTES da checagem de versão — por isso precisa re-rodar
 *   a transação (não existe optimistic lock a re-tentar).
 */
export const isTransientConcurrencyError = (error: unknown): boolean => {
  if (error instanceof AppError && error.code === 'CONFLICT') {
    return true;
  }
  if (!(error instanceof Error) || error.name !== 'MongoServerError') {
    return false;
  }
  const details = error as { code?: unknown; errorLabels?: unknown };
  if (details.code === 112) {
    return true;
  }
  if (Array.isArray(details.errorLabels)) {
    return details.errorLabels.some(
      (label) =>
        label === 'TransientTransactionError' ||
        label === 'UnknownTransactionCommitResult',
    );
  }
  return false;
};

export interface RetryTransientOptions {
  predicate?: (error: unknown) => boolean;
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
  label: string;
}

/**
 * Re-executa `run()` inteiro ao detectar conflito transitório de concorrência.
 * Erros não-transitórios (ou esgotamento das tentativas) propagam imediatamente.
 */
export async function retryTransient<T>(
  run: () => Promise<T>,
  {
    predicate = isTransientConcurrencyError,
    maxAttempts = 25,
    backoffMs = (attempt) =>
      Math.min(300, 5 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 25),
    label,
  }: RetryTransientOptions,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (error: unknown) {
      if (!predicate(error) || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
    }
  }
  throw new Error(`${label} retry exhausted`);
}