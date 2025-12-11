import nodemailer from 'nodemailer';
import type { ContactPayload } from './InMemoryMailerQueue';
import Queue from 'bull';
import type { Queue as BullQueue } from 'bull';
import { contactEnqueuedCounter } from '@/infrastructure/observability/metrics';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const CONTACT_TO = process.env.CONTACT_TO_EMAIL || 'support@example.com';

export async function processContactPayload(payload: ContactPayload): Promise<void> {
  // Build simple plain-text email
  const subject = `[Contact] ${payload.ticketId}`;
  const text = `Ticket: ${payload.ticketId}\nFrom: ${payload.name ?? 'anonymous'} <$${payload.email ?? 'noreply'}>\n\n${payload.message}`;

  // configure transporter from env or use direct transport
  const smtpUrl = process.env.MAILER_SMTP_URL;
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

export function startContactWorker(): BullQueue {
  const queue = new Queue('contact_queue', REDIS_URL) as BullQueue;
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
