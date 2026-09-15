import Queue from 'bull';
import type { Queue as BullQueue } from 'bull';
import { ContactPayload } from './InMemoryMailerQueue';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { contactEnqueuedCounter } from '@/infrastructure/observability/metrics';
import { getRedisUrl } from '@/shared/config/connections';

const REDIS_URL = getRedisUrl();

export class BullMailerQueue {
  private queue: BullQueue;

  constructor() {
    // bull accepts a connection string as the second argument
    this.queue = new Queue('contact_queue', REDIS_URL) as BullQueue;
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

  // not implementing drain helpers for bull adapter
}
