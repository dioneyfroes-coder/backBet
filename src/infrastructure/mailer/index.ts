import { InMemoryMailerQueue } from './InMemoryMailerQueue';
import { BullMailerQueue } from './BullMailerQueue';

let adapter: any = null;

export function getMailerQueue() {
  if (adapter) return adapter;

  if (process.env.USE_REDIS_QUEUE === 'true') {
    try {
      const instance = new BullMailerQueue();
      adapter = instance as any;
      return adapter;
    } catch (err) {
      // fallback to in-memory
      console.warn('Failed to initialise BullMailerQueue, falling back to InMemory', err);
    }
  }

  adapter = InMemoryMailerQueue as any;
  return adapter;
}
