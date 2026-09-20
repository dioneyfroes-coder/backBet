import { z } from 'zod';

/**
 * Campos do corpo do webhook Pix recebido do PSP. A assinatura
 * (`X-BackBet-Signature`) vem no header e o corpo cru (`rawBody`) é capturado
 * pelo middleware de parse — ambos são usados para validar a autenticidade.
 */
export const PixWebhookBodyDTO = z.object({
  type: z.enum(['PIX_PAID', 'PIX_REFUNDED', 'PIX_CANCELED']),
  chargeId: z.string().min(1, 'chargeId é obrigatório'),
  reference: z.string().min(1, 'reference é obrigatório'),
  amount: z.number().positive('amount deve ser positivo'),
  currency: z.enum(['BRL', 'USD', 'EUR']),
});

export type PixWebhookBodyDTOType = z.infer<typeof PixWebhookBodyDTO>;