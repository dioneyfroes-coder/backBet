import 'dotenv/config';
import {
  connectMongoDB,
  disconnectMongoDB,
  getMongoDBConfig,
} from '@/infrastructure/persistence/mongoose/config';
import { MigrationRunner } from '@/infrastructure/database/migrations/MigrationRunner';
import { ensureIndexesMigration } from '@/infrastructure/database/migrations/0001-create-indexes';
import { ensureFinanceIndexesMigration } from '@/infrastructure/database/migrations/0002-create-finance-indexes';

async function main() {
  const config = getMongoDBConfig();
  await connectMongoDB(config);

  try {
    await MigrationRunner.run([ensureIndexesMigration, ensureFinanceIndexesMigration]);
    console.log('✅ Todas as migrações foram aplicadas.');
  } catch (error) {
    console.error('✗ Falha ao executar migrações', error);
    process.exitCode = 1;
  } finally {
    await disconnectMongoDB();
  }
}

main();
