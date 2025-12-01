import { EventCatalogService, EventFilters } from '../../domain/services/EventCatalogService';
import { Event } from '../../domain/entities/Event';

export class ListEventsUseCase {
  constructor(private readonly catalogService: EventCatalogService) {}

  async execute(filters: EventFilters = {}): Promise<Event[]> {
    return this.catalogService.listEvents(filters);
  }
}
