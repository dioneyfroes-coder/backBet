import { Event } from '../entities/Event';
import { EventStatus } from '../../types/bet.types';

export interface IEventRepository {
  save(event: Event): Promise<void>;
  findById(id: string): Promise<Event | null>;
  findByStatus(status: EventStatus): Promise<Event[]>;
  findByCategory(category: string): Promise<Event[]>;
  findUpcoming(limit?: number): Promise<Event[]>;
  update(event: Event): Promise<void>;
  delete(id: string): Promise<void>;
}