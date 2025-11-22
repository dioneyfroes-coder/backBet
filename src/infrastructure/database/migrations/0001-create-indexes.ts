import { MigrationDefinition } from './MigrationRunner';
import { UserModel } from '@/infrastructure/persistence/mongoose/schemas/UserSchema';
import { WalletModel } from '@/infrastructure/persistence/mongoose/schemas/WalletSchema';

export const ensureIndexesMigration: MigrationDefinition = {
  name: '0001-create-user-wallet-indexes',
  description: 'Cria índices únicos e compósitos usados pelas principais consultas',
  run: async () => {
    await Promise.all([
      UserModel.collection.createIndex({ email: 1 }, { unique: true, background: true }),
      UserModel.collection.createIndex({ username: 1 }, { unique: true, background: true }),
      WalletModel.collection.createIndex({ userId: 1 }, { unique: true, background: true }),
      WalletModel.collection.createIndex({ 'transactions.id': 1 }, { background: true }),
    ]);
  },
};
