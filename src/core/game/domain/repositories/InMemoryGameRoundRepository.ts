import { GameRound } from '../entities/GameRound';
import { IGameRoundRepository } from './IGameRoundRepository';

export class InMemoryGameRoundRepository implements IGameRoundRepository {
  private rounds: GameRound[] = [];

  async create(round: GameRound): Promise<void> {
    this.rounds.push(round);
  }

  async findRecent(limit: number = 20): Promise<GameRound[]> {
    return [...this.rounds]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async findByUser(userId: string, limit: number = 20): Promise<GameRound[]> {
    return this.rounds
      .filter((round) => round.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}
