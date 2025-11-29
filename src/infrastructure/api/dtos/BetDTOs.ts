import { z } from 'zod';
import { OddsSchema } from './OddsSchema';

/**
 * DTO para colocar aposta
 */
export const PlaceBetDTO = z.object({
  eventId: z.string().uuid(),
  marketId: z.string(),
  oddId: z.string(),
  amount: z.number().positive().min(0.01),
  type: z.enum(['SINGLE', 'MULTIPLE']).optional().default('SINGLE'),
  currency: z.enum(['BRL', 'USD', 'EUR']).optional().default('BRL'),
});
export type PlaceBetDTOType = z.infer<typeof PlaceBetDTO>;

/**
 * DTO para cancelar aposta
 */
export const CancelBetDTO = z.object({
  betId: z.string().uuid(),
  reason: z.string().optional(),
});
export type CancelBetDTOType = z.infer<typeof CancelBetDTO>;

/**
 * DTO de resposta de aposta
 */
export const BetResponseDTO = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  eventId: z.string().uuid(),
  marketId: z.string(),
  amount: z.number(),
  odds: OddsSchema,
  status: z.enum(['PENDING', 'WON', 'LOST', 'CANCELED']),
  type: z.string(),
  potentialReturn: z.number(),
  createdAt: z.date(),
  resolvedAt: z.date().nullable().optional(),
  cancellationReason: z.string().nullable().optional(),
});
export type BetResponseDTOType = z.infer<typeof BetResponseDTO>;

export const BetListResponseDTO = z.object({
  bets: z.array(BetResponseDTO),
});
export type BetListResponseDTOType = z.infer<typeof BetListResponseDTO>;
