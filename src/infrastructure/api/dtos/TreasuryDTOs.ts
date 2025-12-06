import { z } from 'zod';

const descriptionField = z.string().max(280, 'Descrição deve ter até 280 caracteres').optional();

export const TreasuryAmountDTO = z.object({
  amount: z.number().positive('Valor deve ser positivo'),
  description: descriptionField,
  referenceId: z.string().max(120).optional(),
  actorId: z.string().max(120).optional(),
});

export type TreasuryAmountDTOType = z.infer<typeof TreasuryAmountDTO>;

export const TreasuryRebalanceDTO = z
  .object({
    targetPrizeRatio: z.number().gt(0).lt(1).optional(),
    minProfitBuffer: z.number().min(0).optional(),
    maxTransfer: z.number().positive().optional(),
  })
  .optional();

export type TreasuryRebalanceDTOType = z.infer<typeof TreasuryRebalanceDTO>;
