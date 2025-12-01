import { CoinFlipChoice, GameRound } from '../../domain/entities/GameRound';
import { CoinFlipGameService } from '../../domain/services/CoinFlipGameService';

export type PlayCoinFlipDTO = {
  userId: string;
  choice: CoinFlipChoice;
  wager: number;
};

export class PlayCoinFlipUseCase {
  constructor(private readonly gameService: CoinFlipGameService) {}

  async execute(input: PlayCoinFlipDTO): Promise<GameRound> {
    return this.gameService.play({
      userId: input.userId,
      choice: input.choice,
      wager: input.wager,
    });
  }
}
