import 'dotenv/config';
import {
  connectMongoDB,
  disconnectMongoDB,
  getMongoDBConfig,
} from '@/infrastructure/persistence/mongoose/config';
import { MigrationRunner } from '@/infrastructure/database/migrations/MigrationRunner';
import { ensureIndexesMigration } from '@/infrastructure/database/migrations/0001-create-indexes';
import { ensureFinanceIndexesMigration } from '@/infrastructure/database/migrations/0002-create-finance-indexes';
import { ensureSessionsCollectionMigration } from '@/infrastructure/database/migrations/0003-create-sessions-collection';
import { dropWalletTransactionsIndexMigration } from '@/infrastructure/database/migrations/0004-drop-wallet-transactions-index';
import { ensureEventCategoryIndexMigration } from '@/infrastructure/database/migrations/0005-create-event-category-index';

async function main() {
  const config = getMongoDBConfig();
  await connectMongoDB(config);

  try {
    await MigrationRunner.run([
      ensureIndexesMigration,
      ensureFinanceIndexesMigration,
      ensureSessionsCollectionMigration,
      dropWalletTransactionsIndexMigration,
      ensureEventCategoryIndexMigration,
    ]);
    console.log('✅ Todas as migrações foram aplicadas.');
  } catch (error) {
    console.error('✗ Falha ao executar migrações', error);
    process.exitCode = 1;
  } finally {
    await disconnectMongoDB();
  }
}

main();
