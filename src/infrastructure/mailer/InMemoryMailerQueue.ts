import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { contactEnqueuedCounter } from '@/infrastructure/observability/metrics';

export type ContactPayload = {
  ticketId: string;
  name?: string | null;
  email?: string | null;
  message: string;
  createdAt: string;
};

const queue: ContactPayload[] = [];

export const InMemoryMailerQueue = {
  async enqueueContact(payload: ContactPayload): Promise<void> {
    queue.push(payload);
    writeStructuredLog({ event: 'contact_enqueued', ticketId: payload.ticketId, email: payload.email });
    try {
      contactEnqueuedCounter.inc();
    } catch (_) {
      // ignore
    }
    // In real deployments this would push to a persistent queue (Bull, RabbitMQ, etc.)
  },

  // helper for tests
  _drain(): ContactPayload[] {
    const copy = queue.slice();
    queue.length = 0;
    return copy;
  },
};
