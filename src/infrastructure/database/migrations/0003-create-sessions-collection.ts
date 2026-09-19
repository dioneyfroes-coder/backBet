import { MigrationDefinition } from './MigrationRunner';
import { SessionModel } from '@/infrastructure/persistence/mongoose/schemas/SessionSchema';

export const ensureSessionsCollectionMigration: MigrationDefinition = {
  name: '0003-create-sessions-collection',
  description:
    'Cria a coleção de sessões (JWT refresh rotation / revogação / reutilização) com índices por sessão e usuário',
  run: async () => {
    await SessionModel.init();
    await Promise.all([
      SessionModel.collection.createIndex({ sessionId: 1 }, { unique: true, background: true }),
      SessionModel.collection.createIndex({ userId: 1, status: 1 }, { background: true }),
    ]);
  },
};