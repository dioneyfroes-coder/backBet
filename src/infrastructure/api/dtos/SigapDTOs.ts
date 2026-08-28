import { z } from 'zod';

export const SigapFileTypeSchema = z.enum([
  'APOSTADOR',
  'APOSTAS',
  'CARTEIRA',
  'OPERADOR_DIARIO',
  'OPERADOR_MENSAL',
]);

export const SigapQueryDTO = z.object({
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  fileType: SigapFileTypeSchema.optional(),
  status: z
    .enum(['PENDING', 'TRANSMITTED', 'ACKED', 'REJECTED', 'FAILED', 'RETRY'])
    .optional(),
  referenceDate: z.string().optional(),
});

export type SigapQueryDTOType = z.infer<typeof SigapQueryDTO>;

export const SigapTransmitDTO = z.object({
  fileType: SigapFileTypeSchema,
  referenceDate: z.string().min(1),
  payload: z.array(z.record(z.string(), z.unknown())).min(1),
  operatorId: z.string().optional(),
});

export type SigapTransmitDTOType = z.infer<typeof SigapTransmitDTO>;

export const SigapImpedimentDTO = z.object({
  documentNumber: z.string().min(1),
});

export type SigapImpedimentDTOType = z.infer<typeof SigapImpedimentDTO>;
