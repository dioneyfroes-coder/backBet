import 'dotenv/config';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import {
  FsBackupIO,
  createBackup,
  restoreBackup,
  validateRestored,
} from '@/infrastructure/backup/backupService';
import { MongoBackupDataSource } from '@/infrastructure/backup/mongoBackupDataSource';
import { defaultDbNameFromUri, resolveMongoUri } from './backupHelpers';

async function main() {
  const uri = resolveMongoUri();
  const sourceDb = defaultDbNameFromUri(uri);
  const drillDb = `backbet_drill_${Date.now()}`;
  const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backbet-backup-drill-'));
  let client: MongoClient | undefined;

  try {
    client = new MongoClient(uri);
    await client.connect();
    const source = new MongoBackupDataSource(client);
    const io = new FsBackupIO();

    console.log(`Ciclo de teste — backup de "${sourceDb}" → restore em "${drillDb}" → validação.`);
    const manifest = await createBackup({ source, io, dbName: sourceDb, backupDir });
    console.log(`1. Backup criado em ${backupDir} (${manifest.totalDocuments} documentos).`);

    const restored = await restoreBackup({
      source,
      io,
      backupDir,
      targetDbName: drillDb,
      dropExisting: false,
    });
    console.log(`2. Restore concluído (${restored.totalInserted} documentos em "${drillDb}").`);

    const comparison = await validateRestored(io, backupDir, drillDb, source);
    if (!comparison.ok) {
      throw new Error('Validação pós-restore falhou: ' + JSON.stringify(comparison.mismatches));
    }
    console.log('3. Validação pós-restore: OK (contagens conferem com o backup).');

    await client.db(drillDb).dropDatabase();
    console.log(`4. Banco do drill "${drillDb}" removido.`);
    console.log('✅ Drill de backup/restore/validação concluído com sucesso no ambiente local.');
  } catch (error) {
    console.error('✗ Drill FALHOU:', error);
    process.exitCode = 1;
  } finally {
    await client?.close();
    await fs.rm(backupDir, { recursive: true, force: true });
  }
}

main();