// src/core/betting/infra/repositories/BetRepository.ts
import { IBetRepository } from '../../domain/repositories/IBetRepository';
import { Bet } from '../../domain/entities/Bet';
import { AppError } from '@/shared/errors/AppError';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@/core/odds/domain/value-objects/Odds';
import { BetStatus } from '@/core/betting/types/bet.types';

export class BetRepository implements IBetRepository {
  private bets: Bet[] = [];

  async create(bet: Bet): Promise<void> {
    this.bets.push(this.clone(bet));
  }

  async update(bet: Bet): Promise<void> {
    const index = this.bets.findIndex((b) => b.id === bet.id);
    if (index < 0) return;
    if (this.bets[index].version !== bet.version - 1) {
      throw new AppError('CONFLICT', 'Conflito de concorrência ao atualizar aposta', 409, {
        betId: bet.id,
        expectedVersion: bet.version - 1,
        currentVersion: this.bets[index].version,
      });
    }
    this.bets[index] = this.clone(bet);
  }

  async findById(id: string): Promise<Bet | null> {
    const bet = this.bets.find((b) => b.id === id);
    return bet ? this.clone(bet) : null;
  }

  async findByUserId(userId: string): Promise<Bet[]> {
    return this.bets.filter((b) => b.userId === userId).map((bet) => this.clone(bet));
  }

    async findByEventId(eventId: string): Promise<Bet[]> {
      return this.bets.filter((b) => b.eventId === eventId).map((bet) => this.clone(bet));
    }

    async findByMarketId(marketId: string): Promise<Bet[]> {
      return this.bets.filter((b) => b.marketId === marketId).map((bet) => this.clone(bet));
    }

  async delete(id: string): Promise<boolean> {
    const initialLength = this.bets.length;
    this.bets = this.bets.filter((b) => b.id !== id);
    return this.bets.length < initialLength;
  }

  async findByStatus(status: BetStatus): Promise<Bet[]> {
    return this.bets.filter((b) => b.status === status).map((bet) => this.clone(bet));
  }

  private clone(bet: Bet): Bet {
    return new Bet(
      bet.id,
      bet.userId,
      bet.eventId,
      bet.marketId,
      Money.fromCents(bet.amount.getCents(), bet.amount.currency),
      new Odds(bet.odds.value),
      bet.status,
      bet.type,
      bet.createdAt,
      bet.resolvedAt,
      bet.cancellationReason,
      bet.version,
    );
  }
}
