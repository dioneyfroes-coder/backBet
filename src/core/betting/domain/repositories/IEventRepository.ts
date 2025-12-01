import { Event } from '../entities/Event';
import { EventStatus } from '../../types/bet.types';

export interface IEventRepository {
  create(event: Event): Promise<void>;
  update(event: Event): Promise<void>;
  findById(id: string): Promise<Event | null>;
  findByStatus(status: EventStatus): Promise<Event[]>;
  findByCategory(category: string): Promise<Event[]>; // ou EventCategory
  findUpcoming(limit?: number): Promise<Event[]>;
  findAll(filter?: {
    status?: EventStatus;
    category?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<Event[]>;
  exists(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
