import Redis from 'ioredis';
import { retryWithBackoff } from '@/shared/resilience/retryPolicy';
import { cacheConfig } from '@/shared/config/cacheConfig';
import { redisCircuitBreaker } from '@/shared/resilience/dependencyCircuitBreakers';
import {
  recordRetryAttempt,
  recordRetryFailure,
} from '@/infrastructure/observability/resilienceMetrics';

export interface CacheMetrics {
  hits: number;
  misses: number;
  writes: number;
  errors: number;
}

const CACHE_RETRY_OPTIONS = {
  maxAttempts: 3,
  baseDelayMs: 100,
  factor: 2,
  jitter: 0.2,
  onRetry: (error: unknown, attempt: number, delayMs: number) => {
    recordRetryAttempt('redis');
    console.warn(
      `Redis operation failed (attempt ${attempt}), retrying after ${Math.round(delayMs)}ms`,
      { error },
    );
  },
};

export class RedisClient {
  private client: Redis | null = null;
  private metrics: CacheMetrics = { hits: 0, misses: 0, writes: 0, errors: 0 };

  private getRedis() {
    if (!cacheConfig.enabled) {
      return null;
    }

    if (!this.client) {
      this.client = new Redis(cacheConfig.redisUrl);
      this.client.on('error', (err) => {
        console.error('Redis error', err);
        this.metrics.errors += 1;
      });
    }
    return this.client;
  }

  private async runWithBreaker<T>(operation: () => Promise<T>): Promise<T> {
    return redisCircuitBreaker.execute(() => retryWithBackoff(operation, CACHE_RETRY_OPTIONS));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = this.getRedis();
      if (!client) {
        return null;
      }
      const data = await this.runWithBreaker(() => client.get(key));
      if (data === null) {
        this.metrics.misses += 1;
        return null;
      }
      this.metrics.hits += 1;
      return JSON.parse(data) as T;
    } catch (error) {
      recordRetryFailure('redis');
      this.metrics.errors += 1;
      console.warn('Cache read failed', key, error);
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = cacheConfig.defaultTTLSeconds,
  ): Promise<void> {
    try {
      const client = this.getRedis();
      if (!client) {
        return;
      }
      await this.runWithBreaker(() => client.set(key, JSON.stringify(value), 'EX', ttlSeconds));
      this.metrics.writes += 1;
    } catch (error) {
      recordRetryFailure('redis');
      this.metrics.errors += 1;
      console.warn('Cache write failed', key, error);
    }
  }

  async setIfAbsent<T>(
    key: string,
    value: T,
    ttlSeconds: number = cacheConfig.defaultTTLSeconds,
  ): Promise<boolean> {
    try {
      const client = this.getRedis();
      if (!client) {
        return false;
      }
      const result = await this.runWithBreaker(() =>
        client.set(key, JSON.stringify(value), 'EX', ttlSeconds, 'NX'),
      );
      if (result === 'OK') {
        this.metrics.writes += 1;
        return true;
      }
      return false;
    } catch (error) {
      recordRetryFailure('redis');
      this.metrics.errors += 1;
      console.warn('Cache conditional write failed', key, error);
      return false;
    }
  }

  async del(key: string): Promise<void> {
    try {
      const client = this.getRedis();
      if (!client) {
        return;
      }
      await this.runWithBreaker(() => client.del(key));
    } catch (error) {
      recordRetryFailure('redis');
      this.metrics.errors += 1;
      console.warn('Cache delete failed', key, error);
    }
  }

  async cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const result = await fn();
    await this.set(key, result, ttlSeconds);
    return result;
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  async ping(): Promise<string | null> {
    const client = this.getRedis();
    if (!client) {
      return null;
    }
    try {
      return await this.runWithBreaker(() => client.ping());
    } catch (error) {
      recordRetryFailure('redis');
      this.metrics.errors += 1;
      throw error;
    }
  }

  async quit(): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.quit();
    this.client = null;
  }
}

export const redisClient = new RedisClient();
