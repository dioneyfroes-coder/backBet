/**
 * Copyright (c) 2026 Dioney Froes
 * Project: BackBet
 * Provenance-ID: ML-C4E8
 */
// ML-C4E8
import { ContactDTOType } from '@/infrastructure/api/dtos/ContactDTOs';
import { randomUUID } from 'crypto';
import { getMailerQueue } from '@/infrastructure/mailer';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import {
  contactSpamCounter,
  contactValidationCounter,
} from '@/infrastructure/observability/metrics';

function sanitizeMessage(input: string): string {
  // Simple sanitization: strip HTML tags and trim
  return input.replace(/<[^>]*>/g, '').trim();
}

const FORBIDDEN_WORDS = ['viagra', 'free money', 'click here', 'xxx'];

async function verifyRecaptchaIfEnabled(token?: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return true; // not enabled
  if (!token) return false;

  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
    });
    const data = await res.json();
    return !!data.success;
  } catch (err) {
    return false;
  }
}

export class CreateContactMessage {
  async execute(payload: ContactDTOType): Promise<{ ticketId: string }> {
    // Optional recaptcha verification
    const recaptchaOk = await verifyRecaptchaIfEnabled((payload as any).recaptchaToken);
    if (!recaptchaOk) {
      try {
        contactValidationCounter.inc();
      } catch (err) {
        // ignore metric increment failures in environments without metrics
      }
      throw new (await import('@/shared/errors/AppError')).AppError(
        'BAD_REQUEST',
        'reCAPTCHA verification failed',
        400,
      );
    }

    const ticketId = randomUUID();
    const createdAt = new Date().toISOString();

    const sanitized = sanitizeMessage(payload.message);

    // Heuristic / profanity check
    const lower = sanitized.toLowerCase();
    const found = FORBIDDEN_WORDS.find((w) => lower.includes(w));
    if (found) {
      try {
        contactSpamCounter.inc();
      } catch (err) {
        // ignore metric increment failures
      }
      throw new (await import('@/shared/errors/AppError')).AppError(
        'BAD_REQUEST',
        'Mensagem bloqueada por conteúdo',
        400,
      );
    }

    const entry = {
      ticketId,
      name: payload.name ?? null,
      email: payload.email ?? null,
      message: sanitized,
      createdAt,
    };

    // Enqueue to mailer/worker
    const queue = getMailerQueue();
    await (queue as any).enqueueContact(entry);

    // Log for observability/audit
    writeStructuredLog({ event: 'contact_created', ticketId, email: entry.email });

    return { ticketId };
  }
}
