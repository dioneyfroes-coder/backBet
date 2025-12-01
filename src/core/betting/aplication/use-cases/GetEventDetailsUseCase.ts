import { EventCatalogService } from '../../domain/services/EventCatalogService';
import { Event } from '../../domain/entities/Event';

export class GetEventDetailsUseCase {
  constructor(private readonly catalogService: EventCatalogService) {}

  async execute(eventId: string): Promise<Event> {
    return this.catalogService.getEvent(eventId);
  }
}
