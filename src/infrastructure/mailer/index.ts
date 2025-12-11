import { InMemoryMailerQueue } from './InMemoryMailerQueue';

let adapter: typeof InMemoryMailerQueue | null = null;

export function getMailerQueue() {
  if (adapter) return adapter;

  if (process.env.USE_REDIS_QUEUE === 'true') {
    try {
      // lazy require to avoid forcing dependency when not configured
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { BullMailerQueue } = require('./BullMailerQueue');
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
