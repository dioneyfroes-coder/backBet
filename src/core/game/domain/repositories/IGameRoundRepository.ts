import { GameRound } from '../entities/GameRound';

export interface IGameRoundRepository {
  create(round: GameRound): Promise<void>;
  findRecent(limit?: number): Promise<GameRound[]>;
  findByUser(userId: string, limit?: number): Promise<GameRound[]>;
}
