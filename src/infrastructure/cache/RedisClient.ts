import Redis from 'ioredis';
import { cacheConfig } from '@/shared/config/cacheConfig';

export interface CacheMetrics {
  hits: number;
  misses: number;
  writes: number;
  errors: number;
}

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

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = this.getRedis();
      if (!client) {
        return null;
      }
      const data = await client.get(key);
      if (data === null) {
        this.metrics.misses += 1;
        return null;
      }
      this.metrics.hits += 1;
      return JSON.parse(data) as T;
    } catch (error) {
      this.metrics.errors += 1;
      console.warn('Cache read failed', key, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number = cacheConfig.defaultTTLSeconds): Promise<void> {
    try {
      const client = this.getRedis();
      if (!client) {
        return;
      }
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      this.metrics.writes += 1;
    } catch (error) {
      this.metrics.errors += 1;
      console.warn('Cache write failed', key, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      const client = this.getRedis();
      if (!client) {
        return;
      }
      await client.del(key);
    } catch (error) {
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
      return await client.ping();
    } catch (error) {
      this.metrics.errors += 1;
      throw error;
    }
  }
}

export const redisClient = new RedisClient();
