import { InMemoryMailerQueue } from './InMemoryMailerQueue';
import { BullMailerQueue } from './BullMailerQueue';
import type { ContactPayload } from '@/core/contact/domain/types/ContactMessage';

export interface IMailerQueue {
  enqueueContact(payload: ContactPayload): Promise<void>;
}

let adapter: IMailerQueue | null = null;

export function getMailerQueue(): IMailerQueue {
  if (adapter) return adapter;

  if (process.env.USE_REDIS_QUEUE === 'true') {
    try {
      adapter = new BullMailerQueue();
      return adapter;
    } catch (err) {
      // fallback to in-memory
      console.warn('Failed to initialise BullMailerQueue, falling back to InMemory', err);
    }
  }

  adapter = InMemoryMailerQueue;
  return adapter;
}
