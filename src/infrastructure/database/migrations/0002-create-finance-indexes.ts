import { MigrationDefinition } from './MigrationRunner';
import { WithdrawalRequestModel } from '@/infrastructure/persistence/mongoose/schemas/WithdrawalRequestSchema';
import { LedgerEntryModel } from '@/infrastructure/persistence/mongoose/schemas/LedgerEntrySchema';
import { BetModel } from '@/infrastructure/persistence/mongoose/schemas/BetSchema';

export const ensureFinanceIndexesMigration: MigrationDefinition = {
  name: '0002-create-finance-indexes',
  description: 'Cria índices compostos usados pelas consultas de saque, extrato e apostas',
  run: async () => {
    await Promise.all([
      WithdrawalRequestModel.collection.createIndex({ userId: 1, requestedAt: -1 }, { background: true }),
      WithdrawalRequestModel.collection.createIndex({ status: 1, requestedAt: -1 }, { background: true }),
      WithdrawalRequestModel.collection.createIndex({ status: 1, processingAt: 1 }, { background: true }),
      WithdrawalRequestModel.collection.createIndex({ status: 1, processedAt: 1 }, { background: true }),
      LedgerEntryModel.collection.createIndex({ userId: 1, createdAt: -1 }, { background: true }),
      BetModel.collection.createIndex({ marketId: 1 }, { background: true }),
    ]);
  },
};