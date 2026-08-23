import { EventCatalogService } from '../../domain/services/EventCatalogService';

export class ListEventCategoriesUseCase {
  constructor(private readonly catalogService: EventCatalogService) {}

  async execute(): Promise<string[]> {
    return this.catalogService.listCategories();
  }
}
