import { EventCatalogService } from '../../domain/services/EventCatalogService';
import { Event } from '../../domain/entities/Event';

export class GetUpcomingEventsUseCase {
  constructor(private readonly catalogService: EventCatalogService) {}

  async execute(limit?: number): Promise<Event[]> {
    return this.catalogService.listUpcoming(limit);
  }
}
