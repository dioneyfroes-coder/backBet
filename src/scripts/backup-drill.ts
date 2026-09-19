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
import {
  compareReconciliations,
  describeSummary,
  reconcileDbFinance,
} from '@/infrastructure/backup/financeReconciliation';
import { defaultDbNameFromUri, resolveMongoUri } from './backupHelpers';

const DEFAULT_DRILL_DB = 'backbet_drill';

async function main() {
  const uri = resolveMongoUri();
  const sourceDb = defaultDbNameFromUri(uri);
  const drillDb = process.env.BACKUP_DRILL_DB ?? DEFAULT_DRILL_DB;
  const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backbet-backup-drill-'));
  let client: MongoClient | undefined;

  try {
    client = new MongoClient(uri);
    await client.connect();
    const source = new MongoBackupDataSource(client);
    const io = new FsBackupIO();

    console.log(`Ciclo de teste — backup de "${sourceDb}" → restore em "${drillDb}" → validação → reconciliação.`);
    const manifest = await createBackup({ source, io, dbName: sourceDb, backupDir });
    console.log(`1. Backup criado em ${backupDir} (${manifest.totalDocuments} documentos).`);

    // Banco de drill é descartável e usado só pelo drill: zera collections
    // antes (drop por collection — o usuário não tem dropDatabase) para ser
    // idempotente caso uma execução anterior tenha abortado antes do final.
    await client.db(drillDb).dropDatabase().catch(() => undefined);

    const restored = await restoreBackup({
      source,
      io,
      backupDir,
      targetDbName: drillDb,
      dropExisting: true,
    });
    console.log(`2. Restore concluído (${restored.totalInserted} documentos em "${drillDb}").`);

    const comparison = await validateRestored(io, backupDir, drillDb, source);
    if (!comparison.ok) {
      throw new Error('Validação pós-restore falhou: ' + JSON.stringify(comparison.mismatches));
    }
    console.log('3. Validação pós-restore: OK (contagens conferem com o backup).');

    const sourceSummary = await reconcileDbFinance(client.db(sourceDb));
    describeSummary(`4. Reconciliação financeira de "${sourceDb}" (origem)`, sourceSummary);
    const drillSummary = await reconcileDbFinance(client.db(drillDb));
    describeSummary(`5. Reconciliação financeira de "${drillDb}" (restaurado)`, drillSummary);

    const finance = compareReconciliations(sourceSummary, drillSummary);
    if (!finance.equal || !finance.sourcePassed || !finance.restoredPassed) {
      throw new Error(
        'Reconciliação financeira do ambiente restaurado não confere com o original: ' +
          JSON.stringify(finance.diffs),
      );
    }
    console.log('6. Reconciliação financeira restaurado == origem: OK (ambos íntegros).');

    await client.db(drillDb).dropDatabase().catch(() => {
      console.log(`ℹ️  "${drillDb}" mantido (usuário sem privilégio de dropDatabase); o próximo drill sobrescreve via --drop.`);
    });
    console.log(`7. Banco do drill "${drillDb}" removido (quando permitido).`);
    console.log('✅ Drill de backup/restore/validação/reconciliação concluído com sucesso.');
  } catch (error) {
    console.error('✗ Drill FALHOU:', error);
    process.exitCode = 1;
  } finally {
    await client?.close();
    await fs.rm(backupDir, { recursive: true, force: true });
  }
}

main();