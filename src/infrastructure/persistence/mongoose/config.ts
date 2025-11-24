import mongoose from 'mongoose';
import { retryWithBackoff } from '@/shared/resilience/retryPolicy';
import { mongoCircuitBreaker } from '@/shared/resilience/dependencyCircuitBreakers';
import {
  recordRetryAttempt,
  recordRetryFailure,
} from '@/infrastructure/observability/resilienceMetrics';

export interface MongoDBConfig {
  mongoUri: string;
  dbName: string;
}

const MONGODB_RETRY_OPTIONS = {
  maxAttempts: 4,
  baseDelayMs: 200,
  factor: 2,
  jitter: 0.3,
  onRetry: (error: unknown, attempt: number, delayMs: number) => {
    recordRetryAttempt('mongo');
    console.warn(
      `MongoDB connection attempt ${attempt} failed, retrying after ${Math.round(delayMs)}ms`,
      { error },
    );
  },
};

export async function connectMongoDB(config: MongoDBConfig): Promise<void> {
  try {
    await mongoCircuitBreaker.execute(() =>
      retryWithBackoff(
        () =>
          mongoose.connect(config.mongoUri, {
            dbName: config.dbName,
            retryWrites: true,
            writeConcern: { w: 'majority' },
          }),
        MONGODB_RETRY_OPTIONS,
      ),
    );
    console.log(`✓ MongoDB connected to ${config.dbName}`);
  } catch (error) {
    recordRetryFailure('mongo');
    console.error('✗ MongoDB connection failed after retries:', error);
    throw error;
  }
}

export async function disconnectMongoDB(): Promise<void> {
  try {
    await mongoose.disconnect();
    console.log('✓ MongoDB disconnected');
  } catch (error) {
    console.error('✗ MongoDB disconnection failed:', error);
    throw error;
  }
}

export function getMongoDBConfig(): MongoDBConfig {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'backbet-dev';

  return {
    mongoUri,
    dbName,
  };
}
