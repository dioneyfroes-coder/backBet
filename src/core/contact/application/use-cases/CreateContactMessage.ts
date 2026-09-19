/**
 * Copyright (c) 2026 Dioney Froes
 * Project: BackBet
 * Provenance-ID: ML-C4E8
 */
// ML-C4E8
import { randomUUID } from 'crypto';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import {
  IMetricsPort,
  noopMetrics,
} from '@/shared/observability/IMetricsPort';
import {
  IMailerPort,
  noopMailer,
} from '@/core/contact/domain/ports/IMailerPort';
import type {
  ContactMessageInput,
  ContactPayload,
} from '@/core/contact/domain/types/ContactMessage';

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
  constructor(
    private readonly mailer: IMailerPort = noopMailer,
    private readonly metrics: IMetricsPort = noopMetrics,
  ) {}

  async execute(payload: ContactMessageInput): Promise<{ ticketId: string }> {
    // Optional recaptcha verification
    const recaptchaOk = await verifyRecaptchaIfEnabled(payload.recaptchaToken);
    if (!recaptchaOk) {
      this.metrics.contactValidation.inc();
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
      this.metrics.contactSpam.inc();
      throw new (await import('@/shared/errors/AppError')).AppError(
        'BAD_REQUEST',
        'Mensagem bloqueada por conteúdo',
        400,
      );
    }

    const entry: ContactPayload = {
      ticketId,
      name: payload.name ?? null,
      email: payload.email ?? null,
      message: sanitized,
      createdAt,
    };

    // Enqueue to mailer/worker
    await this.mailer.sendContact(entry);

    // Log for observability/audit
    writeStructuredLog({ event: 'contact_created', ticketId, email: entry.email });

    return { ticketId };
  }
}