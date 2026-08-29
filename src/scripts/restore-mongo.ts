import 'dotenv/config';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { FsBackupIO, restoreBackup, validateRestored } from '@/infrastructure/backup/backupService';
import { MongoBackupDataSource } from '@/infrastructure/backup/mongoBackupDataSource';
import { defaultDbNameFromUri, resolveMongoUri } from './backupHelpers';

function printUsage(): void {
  console.error(
    'Uso: npm run backup:restore -- <diretório-do-backup> [--target-db <nome>] [--drop]',
  );
  console.error('  --drop  substitui as collections existentes no banco de destino.');
}

function parseArgs(): { backupDir: string; targetDbName?: string; drop: boolean } {
  const args = process.argv.slice(2);
  const positionals: string[] = [];
  let targetDbName: string | undefined;
  let drop = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--target-db') {
      targetDbName = args[i + 1];
      i += 1;
    } else if (args[i] === '--drop') {
      drop = true;
    } else {
      positionals.push(args[i]);
    }
  }
  if (positionals.length !== 1) {
    printUsage();
    process.exit(1);
  }
  return { backupDir: path.resolve(positionals[0]), targetDbName, drop };
}

async function main() {
  const { backupDir, targetDbName, drop } = parseArgs();
  const uri = resolveMongoUri();
  let client: MongoClient | undefined;

  try {
    client = new MongoClient(uri);
    await client.connect();
    const source = new MongoBackupDataSource(client);
    const io = new FsBackupIO();
    const effectiveTarget = targetDbName ?? defaultDbNameFromUri(uri);

    console.log(`Restaurando backup "${backupDir}" em "${effectiveTarget}"...`);
    const result = await restoreBackup({
      source,
      io,
      backupDir,
      targetDbName: effectiveTarget,
      dropExisting: drop,
    });

    console.log('✅ Restore concluído');
    console.log('Banco de destino:', result.dbName);
    console.log('Documentos inseridos:', result.totalInserted);
    for (const collection of result.collections) {
      console.log(`  - ${collection.name}: ${collection.inserted}`);
    }

    const validation = await validateRestored(io, backupDir, effectiveTarget, source);
    if (!validation.ok) {
      console.error('✗ Validação pós-restore FALHOU:');
      for (const mismatch of validation.mismatches) {
        console.error(
          `  - ${mismatch.collection}: esperado ${mismatch.expected}, encontrado ${mismatch.actual}`,
        );
      }
      process.exitCode = 1;
      return;
    }
    console.log('🔎 Validação pós-restore: OK (contagens conferem com o manifesto).');
  } catch (error) {
    console.error('✗ Falha ao restaurar backup:', error);
    process.exitCode = 1;
  } finally {
    await client?.close();
  }
}

main();