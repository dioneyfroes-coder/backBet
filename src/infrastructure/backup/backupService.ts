import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EJSON } from 'bson';
import type {
  BackupCollectionPlan,
  BackupIO,
  BackupManifest,
  CreateBackupOptions,
  PurgeBackupsOptions,
  RestoreBackupOptions,
  RestoreBackupResult,
  ValidateBackupResult,
  ValidateRestoredResult,
} from './backupTypes';

const MANIFEST_FILE = 'manifest.json';
const MANIFEST_SCHEMA_VERSION: BackupManifest['schemaVersion'] = 1;
const INSERT_BATCH_SIZE = 1000;
const TIMESTAMP_PATTERN = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/;

export class FsBackupIO implements BackupIO {
  async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf8');
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async rm(filePath: string, recursive: boolean): Promise<void> {
    await fs.rm(filePath, { recursive, force: true });
  }

  async listDirs(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  }
}

export function formatTimestamp(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return [
    pad(date.getFullYear(), 4),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function parseTimestamp(dirName: string): Date | undefined {
  const match = TIMESTAMP_PATTERN.exec(dirName);
  if (!match) {
    return undefined;
  }
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

async function readManifest(io: BackupIO, backupDir: string): Promise<BackupManifest> {
  const raw = await io.readFile(path.join(backupDir, MANIFEST_FILE));
  const manifest = EJSON.parse(raw) as BackupManifest;
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(`Manifesto com schemaVersion não suportado: ${String(manifest.schemaVersion)}`);
  }
  return manifest;
}

export async function createBackup(options: CreateBackupOptions): Promise<BackupManifest> {
  const { source, io, dbName, backupDir } = options;
  await io.ensureDir(backupDir);

  const collectionNames = await source.listCollections(dbName);
  const plans: BackupCollectionPlan[] = [];

  for (const name of collectionNames) {
    const [count, documents] = await Promise.all([
      source.countDocuments(dbName, name),
      source.findDocuments(dbName, name),
    ]);
    const content = `${EJSON.stringify(documents, { relaxed: false })}\n`;
    const fileName = `${name}.json`;
    await io.writeFile(path.join(backupDir, fileName), content);
    plans.push({ name, fileName, count, checksum: hashContent(content) });
  }

  const manifest: BackupManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    dbName,
    totalDocuments: plans.reduce((total, plan) => total + plan.count, 0),
    collections: plans,
  };
  await io.writeFile(path.join(backupDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2));
  return manifest;
}

export async function restoreBackup(options: RestoreBackupOptions): Promise<RestoreBackupResult> {
  const { source, io, backupDir, targetDbName, dropExisting = false } = options;
  const manifest = await readManifest(io, backupDir);

  if (!dropExisting) {
    for (const plan of manifest.collections) {
      const existing = await source.countDocuments(targetDbName, plan.name);
      if (existing > 0) {
        throw new Error(
          `Collection "${plan.name}" já possui ${existing} documento(s) no banco de destino. ` +
            'Use --drop para substituir, ou um banco novo.',
        );
      }
    }
  }

  const restored: { name: string; inserted: number }[] = [];
  let totalInserted = 0;

  for (const plan of manifest.collections) {
    const filePath = path.join(backupDir, plan.fileName);
    const content = await io.readFile(filePath);
    const actualChecksum = hashContent(content);
    if (actualChecksum !== plan.checksum) {
      throw new Error(
        `Checksum divergente em "${plan.fileName}" (esperado ${plan.checksum}, obtido ${actualChecksum}). ` +
          `O arquivo do backup foi corrompido ou adulterado.`,
      );
    }
    const documents = EJSON.parse(content) as unknown[];
    if (documents.length !== plan.count) {
      throw new Error(
        `Contagem divergente em "${plan.name}" (manifesto ${plan.count}, arquivo ${documents.length}).`,
      );
    }
    if (dropExisting) {
      await source.dropCollection(targetDbName, plan.name);
    }
    let inserted = 0;
    for (let i = 0; i < documents.length; i += INSERT_BATCH_SIZE) {
      const batch = documents.slice(i, i + INSERT_BATCH_SIZE);
      inserted += await source.insertMany(targetDbName, plan.name, batch);
    }
    restored.push({ name: plan.name, inserted });
    totalInserted += inserted;
  }

  return { dbName: targetDbName, collections: restored, totalInserted };
}

export async function validateBackup(io: BackupIO, backupDir: string): Promise<ValidateBackupResult> {
  const errors: string[] = [];
  let manifest: BackupManifest;
  try {
    manifest = await readManifest(io, backupDir);
  } catch (error) {
    return {
      ok: false,
      errors: [`Não foi possível ler o manifesto: ${String(error)}`],
      manifest: {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        createdAt: '',
        dbName: '',
        totalDocuments: 0,
        collections: [],
      },
    };
  }

  for (const plan of manifest.collections) {
    const filePath = path.join(backupDir, plan.fileName);
    if (!(await io.exists(filePath))) {
      errors.push(`Arquivo ausente: ${plan.fileName}`);
      continue;
    }
    const content = await io.readFile(filePath);
    const actualChecksum = hashContent(content);
    if (actualChecksum !== plan.checksum) {
      errors.push(`Checksum divergente em "${plan.fileName}".`);
      continue;
    }
    try {
      const parsed = EJSON.parse(content) as unknown[];
      if (parsed.length !== plan.count) {
        errors.push(`Contagem divergente em "${plan.name}".`);
      }
    } catch (error) {
      errors.push(`JSON inválido em "${plan.fileName}": ${String(error)}`);
    }
  }

  return { ok: errors.length === 0, errors, manifest };
}

export async function validateRestored(
  io: BackupIO,
  backupDir: string,
  dbName: string,
  source: RestoreBackupOptions['source'],
): Promise<ValidateRestoredResult> {
  const manifest = await readManifest(io, backupDir);
  const mismatches: ValidateRestoredResult['mismatches'] = [];
  for (const plan of manifest.collections) {
    const actual = await source.countDocuments(dbName, plan.name);
    if (actual !== plan.count) {
      mismatches.push({ collection: plan.name, expected: plan.count, actual });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

export async function purgeOldBackups(options: PurgeBackupsOptions): Promise<string[]> {
  const { io, backupsRootDir, retentionDays, now = new Date() } = options;
  const removed: string[] = [];
  for (const dirName of await io.listDirs(backupsRootDir)) {
    const createdAt = parseTimestamp(dirName);
    if (!createdAt || !(await io.exists(path.join(backupsRootDir, dirName, MANIFEST_FILE)))) {
      continue;
    }
    const ageDays = (now.getTime() - createdAt.getTime()) / 86_400_000;
    if (ageDays > retentionDays) {
      await io.rm(path.join(backupsRootDir, dirName), true);
      removed.push(dirName);
    }
  }
  return removed;
}