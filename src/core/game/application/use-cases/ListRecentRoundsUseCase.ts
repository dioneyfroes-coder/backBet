import { IGameRoundRepository } from '../../domain/repositories/IGameRoundRepository';
import { GameRound } from '../../domain/entities/GameRound';

export class ListRecentRoundsUseCase {
  constructor(private readonly repository: IGameRoundRepository) {}

  execute(limit: number = 10): Promise<GameRound[]> {
    return this.repository.findRecent(limit);
  }
}
