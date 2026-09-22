import { Queue } from 'bullmq';
import type { ContactPayload } from '@/core/contact/domain/types/ContactMessage';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { contactEnqueuedCounter } from '@/infrastructure/observability/metrics';
import { createBullMqConnection } from '@/infrastructure/queues/bullMqConnection';

export class BullMailerQueue {
  private queue: Queue;

  constructor() {
    this.queue = new Queue('contact_queue', {
      connection: createBullMqConnection(),
    });
  }

  async enqueueContact(payload: ContactPayload): Promise<void> {
    await this.queue.add('contact', payload, {
      jobId: payload.ticketId,
      removeOnComplete: true,
      removeOnFail: true,
    });
    writeStructuredLog({
      event: 'contact_enqueued',
      ticketId: payload.ticketId,
      email: payload.email,
    });
    try {
      contactEnqueuedCounter.inc();
    } catch (_) {
      // ignore if metrics not available
    }
  }

  // not implementing drain helpers for bullmq adapter
}