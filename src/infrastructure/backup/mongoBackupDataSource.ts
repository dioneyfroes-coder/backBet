import { MongoClient, type Document } from 'mongodb';
import type { BackupDataSource } from './backupTypes';

const SYSTEM_COLLECTIONS = /^system\./;

export class MongoBackupDataSource implements BackupDataSource {
  constructor(private readonly client: MongoClient) {}

  async listCollections(dbName: string): Promise<string[]> {
    const infos = await this.client.db(dbName).listCollections().toArray();
    return infos
      .map((info) => info.name)
      .filter((name) => !SYSTEM_COLLECTIONS.test(name))
      .sort();
  }

  async countDocuments(dbName: string, collection: string): Promise<number> {
    return this.client.db(dbName).collection(collection).countDocuments({});
  }

  async findDocuments(dbName: string, collection: string): Promise<unknown[]> {
    return this.client.db(dbName).collection(collection).find({}).sort({ _id: 1 }).toArray();
  }

  async insertMany(dbName: string, collection: string, documents: unknown[]): Promise<number> {
    const result = await this.client
      .db(dbName)
      .collection(collection)
      .insertMany(documents as Document[], { ordered: false });
    return result.insertedCount;
  }

  async dropCollection(dbName: string, collection: string): Promise<void> {
    await this.client.db(dbName).collection(collection).drop().catch(() => undefined);
  }
}