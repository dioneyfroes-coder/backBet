import 'dotenv/config';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { FsBackupIO, validateBackup, validateRestored } from '@/infrastructure/backup/backupService';
import { MongoBackupDataSource } from '@/infrastructure/backup/mongoBackupDataSource';
import { resolveMongoUri } from './backupHelpers';

function printUsage(): void {
  console.error(
    'Uso: npm run backup:validate -- <diretório-do-backup> [--check-restored <banco>]',
  );
  console.error(
    '  --check-restored <banco>  além da integridade, confere as contagens do backup contra o banco restaurado.',
  );
}

function parseArgs(): { backupDir: string; checkRestored?: string } {
  const args = process.argv.slice(2);
  const positionals: string[] = [];
  let checkRestored: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--check-restored') {
      checkRestored = args[i + 1];
      i += 1;
    } else {
      positionals.push(args[i]);
    }
  }
  if (positionals.length !== 1) {
    printUsage();
    process.exit(1);
  }
  return { backupDir: path.resolve(positionals[0]), checkRestored };
}

async function main() {
  const { backupDir, checkRestored } = parseArgs();
  const io = new FsBackupIO();

  const result = await validateBackup(io, backupDir);
  if (result.manifest.collections.length === 0) {
    console.log('ℹ️  Manifesto não contém collections (banco vazio). Backups de banco vazio ainda são válidos.');
  }
  if (!result.ok) {
    console.error('✗ Validação de integridade do backup FALHOU:');
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('🔎 Integridade do backup: OK');
  console.log('Banco de origem:', result.manifest.dbName);
  console.log('Documentos:', result.manifest.totalDocuments);
  for (const plan of result.manifest.collections) {
    console.log(`  - ${plan.name}: ${plan.count}`);
  }

  if (checkRestored) {
    const uri = resolveMongoUri();
    let client: MongoClient | undefined;
    try {
      client = new MongoClient(uri);
      await client.connect();
      const comparison = await validateRestored(io, backupDir, checkRestored, new MongoBackupDataSource(client));
      if (!comparison.ok) {
        console.error(`✗ As contagens em "${checkRestored}" divergem do backup:`);
        for (const mismatch of comparison.mismatches) {
          console.error(
            `  - ${mismatch.collection}: esperado ${mismatch.expected}, encontrado ${mismatch.actual}`,
          );
        }
        process.exitCode = 1;
        return;
      }
      console.log(`🔎 Contagens em "${checkRestored}": OK (conferem com o backup).`);
    } catch (error) {
      console.error('✗ Falha ao comparar com o banco restaurado:', error);
      process.exitCode = 1;
    } finally {
      await client?.close();
    }
  }
}

main();