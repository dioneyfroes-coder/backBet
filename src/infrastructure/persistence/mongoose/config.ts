import mongoose from 'mongoose';

export interface MongoDBConfig {
  mongoUri: string;
  dbName: string;
}

export async function connectMongoDB(config: MongoDBConfig): Promise<void> {
  try {
    await mongoose.connect(config.mongoUri, {
      dbName: config.dbName,
      retryWrites: true,
      writeConcern: { w: 'majority' },
    });
    console.log(`✓ MongoDB connected to ${config.dbName}`);
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error);
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
