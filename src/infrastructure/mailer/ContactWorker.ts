import nodemailer from 'nodemailer';
import type { ContactPayload } from '@/core/contact/domain/types/ContactMessage';
import { Worker } from 'bullmq';
import { contactEnqueuedCounter } from '@/infrastructure/observability/metrics';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { IDEMPOTENCY_PROCESSING_RECOVERY_MS } from '@/shared/services/IdempotencyService';
import { idempotencyService } from '@/infrastructure/persistence/idempotencyFactory';
import { canonicalFingerprint } from '@/shared/services/fingerprint';
import { createBullMqConnection } from '@/infrastructure/queues/bullMqConnection';

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

export function startContactWorker(): Worker {
  const queue = new Worker(
    'contact_queue',
    async (job) => {
      // bullmq runs the processor for every job name unless jobs[] restricts it
      const payload = job.data as ContactPayload;
      try {
        await processContactPayload(payload);
      } catch (err) {
        writeStructuredLog({
          event: 'contact_send_failed',
          ticketId: payload.ticketId,
          err,
        });
        throw err;
      }
    },
    {
      connection: createBullMqConnection(),
    },
  );

  queue.on('failed', (job, err) => {
    const payload = job?.data as ContactPayload | undefined;
    writeStructuredLog({
      event: 'contact_job_failed',
      ticketId: payload?.ticketId,
      err,
    });
  });

  return queue;
}
