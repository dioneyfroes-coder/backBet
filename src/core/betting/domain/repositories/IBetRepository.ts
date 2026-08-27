import { Bet } from '../entities/Bet';
import { BetStatus } from '../../types/bet.types';
import { TransactionSession } from '@/core/shared/types/Transaction';

export type BetRepositoryOptions = { session?: TransactionSession };

export interface IBetRepository {
  create(bet: Bet, options?: BetRepositoryOptions): Promise<void>;
  update(bet: Bet, options?: BetRepositoryOptions): Promise<void>;
  findById(id: string, options?: BetRepositoryOptions): Promise<Bet | null>;
  findByUserId(userId: string): Promise<Bet[]>;
  findByEventId(eventId: string): Promise<Bet[]>;
  findByMarketId(marketId: string): Promise<Bet[]>;
  findByStatus(status: BetStatus): Promise<Bet[]>;
  findAll?(filter?: { userId?: string; eventId?: string; status?: BetStatus }): Promise<Bet[]>;
  exists?(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
