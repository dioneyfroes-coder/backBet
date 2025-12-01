import { z } from 'zod';

export const SettleBetDTO = z.object({
  result: z.enum(['WON', 'LOST']),
  marketResult: z.string().min(2, 'marketResult deve ter ao menos 2 caracteres'),
});

export type SettleBetDTOType = z.infer<typeof SettleBetDTO>;
