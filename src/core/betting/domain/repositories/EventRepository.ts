// src/core/betting/infra/repositories/EventRepository.ts
import { IEventRepository } from '../../domain/repositories/IEventRepository';
import { Event } from '../../domain/entities/Event';
import { EventStatus } from '../../types/bet.types';
import { createSampleEvents } from '../../domain/seed/sampleEvents';

type EventFilter = {
  status?: EventStatus;
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export class EventRepository implements IEventRepository {
  private events: Event[] = [];

  constructor() {
    this.events = createSampleEvents();
  }

  async create(event: Event): Promise<void> {
    this.events.push(event);
  }

  async update(event: Event): Promise<void> {
    const index = this.events.findIndex((e) => e.id === event.id);
    if (index >= 0) {
      this.events[index] = event;
      return;
    }
    this.events.push(event);
  }

  async findById(id: string): Promise<Event | null> {
    return this.events.find((e) => e.id === id) || null;
  }

  async findByStatus(status: EventStatus): Promise<Event[]> {
    return this.events.filter((event) => event.status === status);
  }

  async findByCategory(category: string): Promise<Event[]> {
    const normalized = category.toLowerCase();
    return this.events.filter((event) => event.category.toLowerCase() === normalized);
  }

  async findUpcoming(limit: number = 20): Promise<Event[]> {
    const now = Date.now();
    return this.events
      .filter((event) => event.status === 'SCHEDULED' && event.startDate.getTime() >= now)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .slice(0, limit);
  }

  async findAll(filter?: EventFilter): Promise<Event[]> {
    const normalizedCategory = filter?.category?.toLowerCase();
    return this.events
      .filter((event) => {
        if (filter?.status && event.status !== filter.status) {
          return false;
        }
        if (normalizedCategory && event.category.toLowerCase() !== normalizedCategory) {
          return false;
        }
        if (filter?.dateFrom && event.startDate < filter.dateFrom) {
          return false;
        }
        if (filter?.dateTo && event.startDate > filter.dateTo) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }

  async exists(id: string): Promise<boolean> {
    return this.events.some((event) => event.id === id);
  }

  async delete(id: string): Promise<boolean> {
    const initialLength = this.events.length;
    this.events = this.events.filter((e) => e.id !== id);
    return this.events.length < initialLength;
  }
}
