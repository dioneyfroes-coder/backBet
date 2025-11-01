import { Bet } from '../entities/Bet';
import { BetStatus } from '../../types/bet.types';

export interface IBetRepository {
  create(bet: Bet): Promise<void>;
  update(bet: Bet): Promise<void>;
  findById(id: string): Promise<Bet | null>;
  findByUserId(userId: string): Promise<Bet[]>;
  findByEventId(eventId: string): Promise<Bet[]>;
  findByStatus(status: BetStatus): Promise<Bet[]>;
  findAll?(filter?: { userId?: string; eventId?: string; status?: BetStatus }): Promise<Bet[]>;
  exists?(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
