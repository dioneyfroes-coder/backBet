import { IGameRoundRepository } from '../../domain/repositories/IGameRoundRepository';
import { GameRound } from '../../domain/entities/GameRound';

export class GetGameHistoryUseCase {
  constructor(private readonly repository: IGameRoundRepository) {}

  execute(userId: string, limit: number = 20): Promise<GameRound[]> {
    return this.repository.findByUser(userId, limit);
  }
}
