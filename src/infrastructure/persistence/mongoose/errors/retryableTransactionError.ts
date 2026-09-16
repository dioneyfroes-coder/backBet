/**
 * O driver do MongoDB usa error labels para decidir se reexecuta uma transação
 * inteira em `session.withTransaction`. Quando um repositório captura esse erro
 * e o reescreve como `AppError`, a label é perdida e o driver NÃO faz o retry —
 * fazendo operações concorrentes falharem com 500 em vez de convergirem.
 *
 * Este helper identifica os erros que o driver sabe repetir para que os
 * repositórios os deixem propagar intactos até o `withTransaction`.
 *
 * - `TransientTransactionError`: conflito transitório (ex.: WriteConflict 112);
 *   o driver reexecuta o callback inteiro.
 * - `UnknownTransactionCommitResult`: commit com resultado incerto; o driver
 *   repete o commit.
 */
const RETRYABLE_TRANSACTION_LABELS = [
  'TransientTransactionError',
  'UnknownTransactionCommitResult',
] as const;

export const isRetryableTransactionError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const labels = (error as { errorLabels?: unknown }).errorLabels;
  if (!Array.isArray(labels)) {
    return false;
  }
  return labels.some(
    (label) =>
      typeof label === 'string' &&
      (RETRYABLE_TRANSACTION_LABELS as readonly string[]).includes(label),
  );
};
