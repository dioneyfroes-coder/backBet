import { EventCatalogService, EventStatusAction } from '../../domain/services/EventCatalogService';
import { Event } from '../../domain/entities/Event';

export class UpdateEventStatusUseCase {
  constructor(private readonly catalogService: EventCatalogService) {}

  async execute(eventId: string, action: EventStatusAction): Promise<Event> {
    return this.catalogService.updateEventStatus(eventId, action);
  }
}
