import { Bet } from '../../domain/entities/Bet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@core/odds/domain/value-objects/Odds';

interface RawBet {
  id: string;
  userId: string;
  eventId: string;
  marketId: string;
  amount: number;
  odds: number;
  status: Bet['status'];
  type: Bet['type'];
  createdAt: string;
  resolvedAt?: string | null;
  cancellationReason?: string | null;
  version?: number;
  oddId?: string;
}

/**
 * Reconstrói um Bet a partir do resultado serializado armazenado pela
 * Idempotency-Key. Usado por todos os use-cases de aposta que retornam Bet
 * para que uma resposta repetida seja re-hidratada em entidade de domínio.
 */
export function restoreBet(raw: unknown): Bet {
  if (raw instanceof Bet) return raw;

  const r = raw as Partial<RawBet>;
  return new Bet(
    r.id ?? '',
    r.userId ?? '',
    r.eventId ?? '',
    r.marketId ?? '',
    new Money(r.amount ?? 0, 'BRL'),
    new Odds(r.odds ?? 0),
    r.status ?? 'PENDING',
    r.type ?? 'SINGLE',
    new Date(r.createdAt ?? ''),
    r.resolvedAt ? new Date(r.resolvedAt) : undefined,
    r.cancellationReason ?? undefined,
    r.version ?? 1,
    r.oddId ?? '',
  );
}
