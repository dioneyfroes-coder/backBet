// src/core/betting/infra/repositories/EventRepository.ts
import { IEventRepository } from '../../domain/repositories/IEventRepository';
import { Event } from '../../domain/entities/Event';

export class EventRepository implements IEventRepository {
  private events: Event[] = [];

  async findById(id: string): Promise<Event | null> {
    return this.events.find((e) => e.id === id) || null;
  }

  async save(event: Event): Promise<Event> {
    this.events.push(event);
    return event;
  }
}
