import { z } from 'zod';

export const VerifyIdentityDTO = z.object({
  documentNumber: z.string().trim().min(1, 'Documento obrigatório'),
  fullName: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').optional(),
});

export type VerifyIdentityDTOType = z.infer<typeof VerifyIdentityDTO>;

export const ResponsibleGamblingLimitDTO = z.object({
  amountCents: z.number().int().positive('Valor deve ser positivo'),
  period: z.enum(['DAY', 'WEEK', 'MONTH']),
});

export type ResponsibleGamblingLimitDTOType = z.infer<typeof ResponsibleGamblingLimitDTO>;

export const UpdateResponsibleGamblingDTO = z.object({
  selfExclusionUntil: z.union([z.literal('indefinite'), z.string(), z.null()]).optional(),
  clearSelfExclusion: z.boolean().optional(),
  timeOutUntil: z.union([z.string(), z.null()]).optional(),
  depositLimit: z.union([ResponsibleGamblingLimitDTO, z.null()]).optional(),
  betLimit: z.union([ResponsibleGamblingLimitDTO, z.null()]).optional(),
});

export type UpdateResponsibleGamblingDTOType = z.infer<typeof UpdateResponsibleGamblingDTO>;