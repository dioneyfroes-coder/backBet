import { MigrationDefinition } from './MigrationRunner';
import { WalletModel } from '@/infrastructure/persistence/mongoose/schemas/WalletSchema';

/**
 * Item #7 do plano: a Wallet deixou de manter o array embutido
 * `transactions[]` (histórico agora vem do Ledger). Remove o índice órfão
 * `transactions.id` criado pela migração 0001 em bancos existentes.
 */
export const dropWalletTransactionsIndexMigration: MigrationDefinition = {
  name: '0004-drop-wallet-transactions-index',
  description: 'Remove o índice órfão transactions.id do documento Wallet',
  run: async () => {
    const indexes = await WalletModel.collection.indexes();
    if (indexes.some((index) => index.name === 'transactions.id_1')) {
      await WalletModel.collection.dropIndex('transactions.id_1');
    }
  },
};
