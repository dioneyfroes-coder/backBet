import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ProcessPixWebhook } from '@core/finance/application/use-cases/ProcessPixWebhook';
import { PixWebhookBodyDTO } from '../dtos/PixWebhookDTOs';
import { appConfig } from '@/shared/config/appConfig';
import { PixWebhookEvent } from '@core/finance/domain/ports/PixProviderPort';

const SIGNATURE_HEADER = 'x-backbet-signature';

/**
 * Controller do webhook Pix (rota pública, protegida apenas pela assinatura
 * HMAC). Recebe notificações de PIX_PAID / PIX_REFUNDED / PIX_CANCELED do PSP
 * e as repassa ao use-case `ProcessPixWebhook`.
 */
export class PixWebhookController extends BaseController {
  constructor(private processPixWebhook: ProcessPixWebhook) {
    super();
  }

  async receivePixWebhook(req: Request, res: Response): Promise<Response> {
    if (!appConfig.payments.pix.webhookEnabled) {
      return this.serviceUnavailable(res, 'Webhooks Pix estão desabilitados');
    }

    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? '';
    const signatureHeaderValue =
      typeof req.get === 'function' ? req.get(SIGNATURE_HEADER) : undefined;
    const fallback = req.headers?.[SIGNATURE_HEADER];
    const signature = signatureHeaderValue ?? (Array.isArray(fallback) ? fallback[0] : fallback);

    if (!signature) {
      return this.unauthorized(res, 'Header X-BackBet-Signature ausente');
    }

    const payload = this.validateSchema(PixWebhookBodyDTO, req.body);
    if (!payload) {
      return this.badRequest(res, 'Payload de webhook inválido');
    }

    const event: PixWebhookEvent = {
      type: payload.type,
      chargeId: payload.chargeId,
      reference: payload.reference,
      amount: payload.amount,
      currency: payload.currency,
      rawBody,
      signature,
    };

    try {
      const result = await this.processPixWebhook.execute(event);
      return this.ok(res, result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}