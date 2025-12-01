import { GameRound } from '../entities/GameRound';

export interface GameIntegrationPort {
  notifyRound(round: GameRound): Promise<void>;
  broadcastFeed?(rounds: GameRound[]): Promise<void>;
}
