import { CoinFlipChoice, GameRound } from '../../domain/entities/GameRound';
import { CoinFlipGameService } from '../../domain/services/CoinFlipGameService';
import { IdempotencyService } from '@/shared/services/IdempotencyService';

export type PlayCoinFlipDTO = {
  userId: string;
  choice: CoinFlipChoice;
  wager: number;
};

export class PlayCoinFlipUseCase {
  constructor(
    private readonly gameService: CoinFlipGameService,
    private readonly idempotency?: IdempotencyService,
  ) {}

  async execute(input: PlayCoinFlipDTO, idempotencyKey?: string): Promise<GameRound> {
    const operation = () => this.gameService.play({
      userId: input.userId,
      choice: input.choice,
      wager: input.wager,
    });
    if (!this.idempotency || !idempotencyKey) {
      return operation();
    }
    return this.idempotency.execute(
      `${input.userId}:coin-flip:${idempotencyKey}`,
      JSON.stringify(input),
      operation,
      (raw) => new GameRound(
        raw.id,
        raw.userId,
        raw.gameType,
        raw.wagerAmount,
        raw.currency,
        raw.playerChoice,
        raw.outcome,
        raw.result,
        raw.payoutAmount,
        new Date(raw.createdAt),
        raw.metadata,
      ),
    );
  }
}
