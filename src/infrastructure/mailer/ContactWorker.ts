import nodemailer from 'nodemailer';
import type { ContactPayload } from '@/core/contact/domain/types/ContactMessage';
import Queue from 'bull';
import type { Queue as BullQueue } from 'bull';
import { contactEnqueuedCounter } from '@/infrastructure/observability/metrics';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { IDEMPOTENCY_PROCESSING_RECOVERY_MS } from '@/shared/services/IdempotencyService';
import { idempotencyService } from '@/infrastructure/persistence/idempotencyFactory';
import { canonicalFingerprint } from '@/shared/services/fingerprint';
import { getRedisUrl } from '@/shared/config/connections';

const CONTACT_TO = process.env.CONTACT_TO_EMAIL || 'support@example.com';

async function processContactPayloadOnce(payload: ContactPayload): Promise<void> {
  // Build simple plain-text email
  const subject = `[Contact] ${payload.ticketId}`;
  const text = `Ticket: ${payload.ticketId}\nFrom: ${payload.name ?? 'anonymous'} <$${payload.email ?? 'noreply'}>\n\n${payload.message}`;

  // configure transporter from env or use direct transport
  const mailerRuntimeEnv = process.env.BACKBET_RUNTIME_ENV || process.env.NODE_ENV || 'development';
  const smtpUrl = mailerRuntimeEnv === 'test' ? undefined : process.env.MAILER_SMTP_URL;
  const transport = smtpUrl
    ? nodemailer.createTransport(smtpUrl)
    : nodemailer.createTransport({ jsonTransport: true });

  await transport.sendMail({
    to: CONTACT_TO,
    subject,
    text,
    replyTo: payload.email ?? undefined,
  });

  try {
    contactEnqueuedCounter.inc();
  } catch (err) {
    // ignore metric increment failures in environments without metrics
  }

  writeStructuredLog({ event: 'contact_sent', ticketId: payload.ticketId, email: payload.email });
}

export async function processContactPayload(payload: ContactPayload): Promise<void> {
  await idempotencyService.execute(
    `contact-email:${payload.ticketId}`,
    canonicalFingerprint(payload),
    () => processContactPayloadOnce(payload),
    undefined,
    IDEMPOTENCY_PROCESSING_RECOVERY_MS,
  );
}

export function startContactWorker(): BullQueue {
  const queue = new Queue('contact_queue', getRedisUrl()) as BullQueue;
  // using named processor 'contact'
  queue.process('contact', async (job) => {
    try {
      await processContactPayload(job.data as ContactPayload);
      return Promise.resolve();
    } catch (err) {
      writeStructuredLog({
        event: 'contact_send_failed',
        ticketId: (job.data as any)?.ticketId,
        err,
      });
      return Promise.reject(err);
    }
  });

  queue.on('failed', (job, err) => {
    writeStructuredLog({
      event: 'contact_job_failed',
      ticketId: (job?.data as any)?.ticketId,
      err,
    });
  });

  return queue;
}
