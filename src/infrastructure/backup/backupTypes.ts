export type BackupCollectionPlan = {
  name: string;
  fileName: string;
  count: number;
  checksum: string;
};

export type BackupManifest = {
  schemaVersion: 1;
  createdAt: string;
  dbName: string;
  totalDocuments: number;
  collections: BackupCollectionPlan[];
};

export interface BackupDataSource {
  listCollections(dbName: string): Promise<string[]>;
  countDocuments(dbName: string, collection: string): Promise<number>;
  findDocuments(dbName: string, collection: string): Promise<unknown[]>;
  insertMany(dbName: string, collection: string, documents: unknown[]): Promise<number>;
  dropCollection(dbName: string, collection: string): Promise<void>;
}

export interface BackupIO {
  ensureDir(dir: string): Promise<void>;
  writeFile(filePath: string, content: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  exists(filePath: string): Promise<boolean>;
  rm(filePath: string, recursive: boolean): Promise<void>;
  listDirs(dir: string): Promise<string[]>;
}

export type CreateBackupOptions = {
  source: BackupDataSource;
  io: BackupIO;
  dbName: string;
  backupDir: string;
};

export type RestoreBackupOptions = {
  source: BackupDataSource;
  io: BackupIO;
  backupDir: string;
  targetDbName: string;
  dropExisting?: boolean;
};

export type RestoreBackupResult = {
  dbName: string;
  collections: { name: string; inserted: number }[];
  totalInserted: number;
};

export type ValidateBackupResult = {
  ok: boolean;
  errors: string[];
  manifest: BackupManifest;
};

export type ValidateRestoredResult = {
  ok: boolean;
  mismatches: { collection: string; expected: number; actual: number }[];
};

export type PurgeBackupsOptions = {
  io: BackupIO;
  backupsRootDir: string;
  retentionDays: number;
  now?: Date;
};