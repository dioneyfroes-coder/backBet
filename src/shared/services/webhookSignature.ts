import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Assina um corpo de webhook (bytes crus) com HMAC-SHA256.
 * O `rawBody` deve ser EXATAMENTE o corpo enviado/recebido (sem re-serializar),
 * para que a assinatura valide sobre os bytes originais.
 */
export function signWebhookBody(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/**
 * Verifica a assinatura HMAC-SHA256 de forma consta-só-tempo (timing-safe).
 * Retorna false se a assinatura estiver ausente ou não bater com o segredo.
 */
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) {
    return false;
  }
  const expected = signWebhookBody(rawBody, secret);
  const received = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (received.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(received, expectedBuf);
}