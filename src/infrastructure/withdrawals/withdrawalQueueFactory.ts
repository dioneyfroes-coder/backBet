import IORedis from 'ioredis';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { InMemoryWithdrawalQueue } from './InMemoryWithdrawalQueue';
import { BullWithdrawalQueue } from './BullWithdrawalQueue';
import type IWithdrawalQueue from '@/core/finance/domain/ports/IWithdrawalQueue';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export async function createWithdrawalQueue(): Promise<IWithdrawalQueue> {
  // Try a lightweight ping to Redis before deciding to use Bull. This avoids throwing
  // when Redis is not available and provides a clear fallback to an in-memory queue.
  const client = new IORedis(REDIS_URL);
  try {
    await client.ping();
    await client.quit();
    writeStructuredLog({ event: 'withdrawal_queue_backend', backend: 'bull', redis: REDIS_URL });
    return new BullWithdrawalQueue();
  } catch (err) {
    try {
      await client.quit();
    } catch (_) {
      // ignore
    }
    writeStructuredLog({
      event: 'withdrawal_queue_fallback',
      backend: 'inmemory',
      redis: REDIS_URL,
      err,
    });
    return new InMemoryWithdrawalQueue();
  }
}

export default createWithdrawalQueue;
