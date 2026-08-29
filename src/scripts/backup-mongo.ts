import 'dotenv/config';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import {
  FsBackupIO,
  createBackup,
  formatTimestamp,
  purgeOldBackups,
} from '@/infrastructure/backup/backupService';
import { MongoBackupDataSource } from '@/infrastructure/backup/mongoBackupDataSource';
import { defaultDbNameFromUri, resolveMongoUri } from './backupHelpers';

const DEFAULT_RETENTION_DAYS = 30;

function parseArgs(): { dbName?: string; retentionDays: number; backupRootDir: string } {
  const args = process.argv.slice(2);
  let dbName: string | undefined;
  let retentionDays = DEFAULT_RETENTION_DAYS;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--db') {
      dbName = args[i + 1];
      i += 1;
    } else if (args[i] === '--retention') {
      retentionDays = Number(args[i + 1]);
      i += 1;
    }
  }
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
    console.error('✗ --retention deve ser um número de dias inteiro maior que zero.');
    process.exit(1);
  }
  return { dbName, retentionDays, backupRootDir: process.env.BACKUP_DIR ?? './backups' };
}

async function main() {
  const { dbName, retentionDays, backupRootDir } = parseArgs();
  const uri = resolveMongoUri();
  const sourceDb = dbName ?? defaultDbNameFromUri(uri);
  let client: MongoClient | undefined;

  try {
    client = new MongoClient(uri);
    await client.connect();
    const source = new MongoBackupDataSource(client);
    const io = new FsBackupIO();
    const backupDir = path.join(backupRootDir, formatTimestamp(new Date()));

    const manifest = await createBackup({ source, io, dbName: sourceDb, backupDir });

    console.log('✅ Backup criado com sucesso');
    console.log('Banco de origem:', manifest.dbName);
    console.log('Diretório do backup:', backupDir);
    console.log('Documentos:', manifest.totalDocuments);
    for (const plan of manifest.collections) {
      console.log(`  - ${plan.name}: ${plan.count}`);
    }

    const removed = await purgeOldBackups({
      io,
      backupsRootDir: backupRootDir,
      retentionDays,
    });
    if (removed.length > 0) {
      console.log(`🧹 Retenção ($BACKUP_RETENTION_DAYS): removidos ${removed.length} backup(s) antigos:`);
      for (const name of removed) {
        console.log(`  - ${name}`);
      }
    } else {
      console.log('🧹 Retenção: nenhum backup antigo a remover.');
    }
  } catch (error) {
    console.error('✗ Falha ao criar backup:', error);
    process.exitCode = 1;
  } finally {
    await client?.close();
  }
}

main();