import { z } from 'zod';

export const PlayCoinFlipDTO = z.object({
  choice: z.enum(['HEADS', 'TAILS']),
  wager: z
    .number()
    .positive('wager deve ser positivo')
    .or(z.string().regex(/^\d+(\.\d{1,2})?$/))
    .transform((value) => (typeof value === 'number' ? value : Number.parseFloat(value)))
    .refine((value) => Number.isFinite(value) && value > 0, {
      message: 'wager deve ser um número válido',
    }),
});

export const ListHistoryQueryDTO = z.object({
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number.parseInt(value, 10))
    .refine((value) => value > 0 && value <= 50, 'limit deve estar entre 1 e 50')
    .optional(),
});

export type PlayCoinFlipDTOType = z.infer<typeof PlayCoinFlipDTO>;
export type ListHistoryQueryDTOType = z.infer<typeof ListHistoryQueryDTO>;
