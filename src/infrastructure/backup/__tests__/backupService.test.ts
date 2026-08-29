import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Decimal128, ObjectId } from 'mongodb';
import { EJSON } from 'bson';
import type { BackupDataSource, BackupIO } from '../backupTypes';
import {
  FsBackupIO,
  createBackup,
  formatTimestamp,
  purgeOldBackups,
  restoreBackup,
  validateBackup,
  validateRestored,
} from '../backupService';

class InMemoryBackupDataSource implements BackupDataSource {
  readonly data = new Map<string, Map<string, unknown[]>>();

  constructor(seed: Record<string, Record<string, unknown[]>> = {}) {
    for (const [dbName, collections] of Object.entries(seed)) {
      const dbMap = new Map<string, unknown[]>();
      for (const [name, docs] of Object.entries(collections)) {
        dbMap.set(name, [...docs]);
      }
      this.data.set(dbName, dbMap);
    }
  }

  private documents(dbName: string, collection: string): unknown[] {
    let dbMap = this.data.get(dbName);
    if (!dbMap) {
      dbMap = new Map();
      this.data.set(dbName, dbMap);
    }
    let docs = dbMap.get(collection);
    if (!docs) {
      docs = [];
      dbMap.set(collection, docs);
    }
    return docs;
  }

  async listCollections(dbName: string): Promise<string[]> {
    return [...(this.data.get(dbName)?.keys() ?? [])].sort();
  }

  async countDocuments(dbName: string, collection: string): Promise<number> {
    return this.documents(dbName, collection).length;
  }

  async findDocuments(dbName: string, collection: string): Promise<unknown[]> {
    return [...this.documents(dbName, collection)];
  }

  async insertMany(dbName: string, collection: string, documents: unknown[]): Promise<number> {
    this.documents(dbName, collection).push(...documents);
    return documents.length;
  }

  async dropCollection(dbName: string, collection: string): Promise<void> {
    this.data.get(dbName)?.delete(collection);
  }
}

function ejsonSet(documents: unknown[]): string[] {
  return documents.map((doc) => EJSON.stringify(doc, { relaxed: false })).sort();
}

describe('BackupService', () => {
  const io: BackupIO = new FsBackupIO();
  let tempDir: string;
  let source: InMemoryBackupDataSource;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backbet-backup-test-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    source = new InMemoryBackupDataSource({
      primary: {
        users: [
          { _id: new ObjectId('662a3f2e0000000000000001'), name: 'Ana', balance: new Decimal128('50.00') },
          { _id: new ObjectId('662a3f2e0000000000000002'), name: 'Bruno', createdAt: new Date('2026-01-02T00:00:00Z') },
        ],
        wallets: [
          { _id: new ObjectId('662a3f2e0000000000000003'), userId: 'u1', balanceCents: 10000 },
        ],
      },
      empty: {},
    });
  });

  it('createBackup grava arquivos + manifesto com contagens e checksums válidos', async () => {
    const backupDir = path.join(tempDir, 'bk-1');
    const manifest = await createBackup({
      source,
      io,
      dbName: 'primary',
      backupDir,
    });

    expect(manifest.dbName).toBe('primary');
    expect(manifest.totalDocuments).toBe(3);
    expect(manifest.collections).toHaveLength(2);
    expect(manifest.collections.map((plan) => plan.name).sort()).toEqual(['users', 'wallets']);

    const wallets = manifest.collections.find((plan) => plan.name === 'wallets');
    expect(wallets?.count).toBe(1);
    expect(wallets?.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(await io.exists(path.join(backupDir, 'users.json'))).toBe(true);
    expect(await io.exists(path.join(backupDir, 'wallets.json'))).toBe(true);

    const validation = await validateBackup(io, backupDir);
    expect(validation.ok).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('createBackup de banco vazio gera manifesto sem collections e continua válido', async () => {
    const backupDir = path.join(tempDir, 'bk-empty');
    const manifest = await createBackup({ source, io, dbName: 'empty', backupDir });
    expect(manifest.collections).toEqual([]);
    expect(manifest.totalDocuments).toBe(0);
    const validation = await validateBackup(io, backupDir);
    expect(validation.ok).toBe(true);
  });

  it('restoreBackup recria os documentos em novo banco preservando tipos BSON', async () => {
    const backupDir = path.join(tempDir, 'bk-restore');
    await createBackup({ source, io, dbName: 'primary', backupDir });

    const result = await restoreBackup({
      source,
      io,
      backupDir,
      targetDbName: 'restored-1',
      dropExisting: false,
    });

    expect(result.totalInserted).toBe(3);
    const users = source.data.get('restored-1')?.get('users') ?? [];
    const restoredUser = users[0] as { _id: unknown; balance: unknown };

    expect(restoredUser._id).toBeInstanceOf(ObjectId);
    expect(restoredUser.balance).toBeInstanceOf(Decimal128);
    expect(ejsonSet(users)).toEqual(
      expect.arrayContaining(ejsonSet([
        { _id: new ObjectId('662a3f2e0000000000000001'), name: 'Ana', balance: new Decimal128('50.00') },
        { _id: new ObjectId('662a3f2e0000000000000002'), name: 'Bruno', createdAt: new Date('2026-01-02T00:00:00Z') },
      ])),
    );

    const validation = await validateRestored(io, backupDir, 'restored-1', source);
    expect(validation.ok).toBe(true);
  });

  it('restoreBackup recusa sobrescrever banco com dados sem --drop', async () => {
    const backupDir = path.join(tempDir, 'bk-restore-refuse');
    await createBackup({ source, io, dbName: 'primary', backupDir });

    await expect(
      restoreBackup({ source, io, backupDir, targetDbName: 'primary', dropExisting: false }),
    ).rejects.toThrow(/já possui 2 documento/);
  });

  it('restoreBackup com drop substitui as collections existentes', async () => {
    const backupDir = path.join(tempDir, 'bk-restore-drop');
    await createBackup({ source, io, dbName: 'primary', backupDir });

    source.data.set('target', new Map([['users', [{ _id: new ObjectId(), stale: true }]]]));

    const result = await restoreBackup({
      source,
      io,
      backupDir,
      targetDbName: 'target',
      dropExisting: true,
    });

    expect(result.totalInserted).toBe(3);
    expect(source.data.get('target')?.get('users')).toHaveLength(2);
  });

  it('restoreBackup rejeita arquivo com checksum adulterado', async () => {
    const backupDir = path.join(tempDir, 'bk-tamper');
    await createBackup({ source, io, dbName: 'primary', backupDir });

    await fs.appendFile(path.join(backupDir, 'users.json'), 'tampered');

    await expect(
      restoreBackup({ source, io, backupDir, targetDbName: 'restored-tamper' }),
    ).rejects.toThrow(/Checksum divergente/);
  });

  it('validateBackup aponta arquivo ausente como erro', async () => {
    const backupDir = path.join(tempDir, 'bk-missing');
    await createBackup({ source, io, dbName: 'primary', backupDir });
    await fs.rm(path.join(backupDir, 'wallets.json'));

    const validation = await validateBackup(io, backupDir);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('wallets.json');
  });

  it('validateRestored acusa divergência de contagem após alteração no banco', async () => {
    const backupDir = path.join(tempDir, 'bk-count');
    await createBackup({ source, io, dbName: 'primary', backupDir });
    await restoreBackup({ source, io, backupDir, targetDbName: 'restored-count' });
    await source.insertMany('restored-count', 'users', [{ _id: new ObjectId(), name: 'Extra' }]);

    const validation = await validateRestored(io, backupDir, 'restored-count', source);
    expect(validation.ok).toBe(false);
    expect(validation.mismatches).toEqual([
      expect.objectContaining({ collection: 'users', expected: 2, actual: 3 }),
    ]);
  });

  it('purgeOldBackups remove apenas backups antigos e ignora diretórios sem manifesto', async () => {
    const root = path.join(tempDir, 'bk-root');
    await io.ensureDir(root);

    const oldDir = path.join(root, formatTimestamp(new Date('2026-01-01T01:00:00')));
    const recentDir = path.join(root, formatTimestamp(new Date('2026-08-28T01:00:00')));
    const strayDir = path.join(root, 'not-a-backup');
    await createBackup({ source, io, dbName: 'primary', backupDir: oldDir });
    await createBackup({ source, io, dbName: 'primary', backupDir: recentDir });
    await io.ensureDir(strayDir);

    const removed = await purgeOldBackups({
      io,
      backupsRootDir: root,
      retentionDays: 7,
      now: new Date('2026-08-29T12:00:00'),
    });

    expect(removed).toEqual([oldDir.split(path.sep).pop()]);
    expect(await io.exists(oldDir)).toBe(false);
    expect(await io.exists(recentDir)).toBe(true);
    expect(await io.exists(strayDir)).toBe(true);
  });
});