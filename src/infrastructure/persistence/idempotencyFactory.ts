import { cacheConfig } from '@/shared/config/cacheConfig';
import {
  IdempotencyService,
  InMemoryIdempotencyStore,
} from '@/shared/services/IdempotencyService';
import { coreMetrics } from '@/infrastructure/observability/coreMetrics';
import { MongoIdempotencyStore } from '@/infrastructure/persistence/mongoose/stores/MongoIdempotencyStore';
import { RedisIdempotencyStore } from '@/infrastructure/persistence/idempotency/RedisIdempotencyStore';

const idempotencyRuntimeEnv = process.env.BACKBET_RUNTIME_ENV || process.env.NODE_ENV || 'development';
const useMongooseStore =
  process.env.USE_MONGOOSE_PERSISTENCE === 'true' && idempotencyRuntimeEnv !== 'test';

export const idempotencyService = new IdempotencyService(
  useMongooseStore
    ? new MongoIdempotencyStore()
    : cacheConfig.enabled
      ? new RedisIdempotencyStore()
      : new InMemoryIdempotencyStore(),
  24 * 60 * 60,
  coreMetrics,
);