import IORedis from 'ioredis';
import { getRedisUrl } from '@/shared/config/connections';

/**
 * Conexão Redis compartilhada para BullMQ (producers e workers). O BullMQ tem
 * o próprio mecanismo de retry/blocking, então o cliente ioredis precisa ser
 * criado com maxRetriesPerRequest: null (exigência do Worker do BullMQ).
 */
export function createBullMqConnection(): IORedis {
  return new IORedis(getRedisUrl(), { maxRetriesPerRequest: null });
}