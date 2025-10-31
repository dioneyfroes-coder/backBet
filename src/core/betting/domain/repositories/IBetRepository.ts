import { Bet } from '../entities/Bet';
import { BetStatus } from '../../types/bet.types';

export interface IBetRepository {
  save(bet: Bet): Promise<void>;
  findById(id: string): Promise<Bet | null>;
  findByUserId(userId: string): Promise<Bet[]>;
  findByEventId(eventId: string): Promise<Bet[]>;
  findByStatus(status: BetStatus): Promise<Bet[]>;
  update(bet: Bet): Promise<void>;
  delete(id: string): Promise<void>;
}