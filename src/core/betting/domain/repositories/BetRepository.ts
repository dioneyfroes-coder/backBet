// src/core/betting/infra/repositories/BetRepository.ts
import { IBetRepository } from '../../domain/repositories/IBetRepository';
import { Bet } from '../../domain/entities/Bet';

export class BetRepository implements IBetRepository {
  private bets: Bet[] = [];

  async create(bet: Bet): Promise<void> {
    this.bets.push(bet);
  }

  async update(bet: Bet): Promise<void> {
    const index = this.bets.findIndex((b) => b.id === bet.id);
    if (index >= 0) this.bets[index] = bet;
  }

  async findById(id: string): Promise<Bet | null> {
    return this.bets.find((b) => b.id === id) || null;
  }

  async findByUserId(userId: string): Promise<Bet[]> {
    return this.bets.filter((b) => b.userId === userId);
  }

  async findByEventId(eventId: string): Promise<Bet[]> {
    return this.bets.filter((b) => b.eventId === eventId);
  }

  async delete(id: string): Promise<boolean> {
    const initialLength = this.bets.length;
    this.bets = this.bets.filter((b) => b.id !== id);
    return this.bets.length < initialLength;
  }

  async findByStatus(): Promise<Bet[]> {
    return [];
  }
}
