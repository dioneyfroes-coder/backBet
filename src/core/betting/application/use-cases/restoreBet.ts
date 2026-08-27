import { Bet } from '../../domain/entities/Bet';

/**
 * Reconstrói um Bet a partir do resultado serializado armazenado pela
 * Idempotency-Key. Usado por todos os use-cases de aposta que retornam Bet
 * para que uma resposta repetida seja re-hidratada em entidade de domínio.
 */
export function restoreBet(raw: unknown): Bet {
  const r = raw as Record<string, any>;
  return new Bet(
    r.id,
    r.userId,
    r.eventId,
    r.marketId,
    r.amount,
    r.odds,
    r.status,
    r.type,
    new Date(r.createdAt),
    r.resolvedAt ? new Date(r.resolvedAt) : undefined,
    r.cancellationReason,
  );
}
