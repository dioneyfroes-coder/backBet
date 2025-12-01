import { IEventRepository } from '../repositories/IEventRepository';
import { Event } from '../entities/Event';
import { EventStatus } from '../../types/bet.types';
import { DomainError } from '@/core/shared/domain/errors/DomainError';

export type EventFilters = {
  status?: EventStatus;
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  limit?: number;
};

export type EventStatusAction = 'START' | 'FINISH' | 'CANCEL';

export class EventCatalogService {
  constructor(private readonly eventRepository: IEventRepository) {}

  async listEvents(filter: EventFilters = {}): Promise<Event[]> {
    const repositoryFilter = {
      status: filter.status,
      category: filter.category,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    };

    let events = await this.eventRepository.findAll(repositoryFilter);

    if (filter.search && filter.search.trim().length > 0) {
      const search = filter.search.trim().toLowerCase();
      events = events.filter((event) => {
        if (event.name.toLowerCase().includes(search)) {
          return true;
        }
        return event.participants.some((participant) => participant.toLowerCase().includes(search));
      });
    }

    if (filter.limit && filter.limit > 0) {
      events = events.slice(0, filter.limit);
    }

    return events;
  }

  async listUpcoming(limit: number = 10): Promise<Event[]> {
    return this.eventRepository.findUpcoming(limit);
  }

  async getEvent(eventId: string): Promise<Event> {
    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw new DomainError({ code: 'EVENT_NOT_FOUND', message: 'Event not found', details: { eventId } });
    }
    return event;
  }

  async listCategories(): Promise<string[]> {
    const events = await this.eventRepository.findAll();
    const categories = Array.from(new Set(events.map((event) => event.category)));
    return categories.sort((a, b) => a.localeCompare(b));
  }

  async updateEventStatus(eventId: string, action: EventStatusAction): Promise<Event> {
    const event = await this.getEvent(eventId);

    switch (action) {
      case 'START':
        event.start();
        break;
      case 'FINISH':
        event.finish();
        break;
      case 'CANCEL':
        event.cancel();
        break;
      default:
        throw new DomainError({
          code: 'EVENT_INVALID_ACTION',
          message: 'Unsupported event action',
          details: { action },
        });
    }

    await this.eventRepository.update(event);
    return event;
  }
}
