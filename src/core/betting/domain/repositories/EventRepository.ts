// src/core/betting/infra/repositories/EventRepository.ts
import { IEventRepository } from '../../domain/repositories/IEventRepository';
import { Event } from '../../domain/entities/Event';
import { EventStatus } from '../../types/bet.types';

export class EventRepository implements IEventRepository {
  private events: Event[] = [];

  async create(event: Event): Promise<void> {
    this.events.push(event);
  }

  async update(event: Event): Promise<void> {
    const index = this.events.findIndex((e) => e.id === event.id);
    if (index >= 0) this.events[index] = event;
  }

  async findById(id: string): Promise<Event | null> {
    return this.events.find((e) => e.id === id) || null;
  }

  async findByStatus(): Promise<Event[]> {
    return [];
  }

  async findByCategory(): Promise<Event[]> {
    return [];
  }

  async findUpcoming(): Promise<Event[]> {
    return [];
  }

  async delete(id: string): Promise<boolean> {
    const initialLength = this.events.length;
    this.events = this.events.filter((e) => e.id !== id);
    return this.events.length < initialLength;
  }
}
