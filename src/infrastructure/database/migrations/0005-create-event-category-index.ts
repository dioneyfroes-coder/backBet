import { MigrationDefinition } from './MigrationRunner';
import { EventModel } from '@/infrastructure/persistence/mongoose/schemas/EventSchema';

/**
 * Item #12 do plano: `findByCategory` passou a consultar `{ category }`
 * diretamente no Mongo. Cria o índice composto (category + startDate) com
 * collation de força 2 para preservar a semântica case-insensitive sem
 * carregar todos os eventos para o Node.
 */
export const ensureEventCategoryIndexMigration: MigrationDefinition = {
  name: '0005-create-event-category-index',
  description: 'Cria índice { category, startDate } (collation case-insensitive) em events',
  run: async () => {
    await EventModel.collection.createIndex(
      { category: 1, startDate: 1 },
      { collation: { locale: 'en', strength: 2 }, background: true },
    );
  },
};
