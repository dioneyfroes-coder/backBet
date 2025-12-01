import { DomainError } from '@/core/shared/domain/errors/DomainError';

export type GameType = 'COIN_FLIP';
export type GameResult = 'WIN' | 'LOSE';
export type CoinFlipChoice = 'HEADS' | 'TAILS';

export type GameRoundMetadata = Record<string, unknown> | undefined;

export class GameRound {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly gameType: GameType,
    public readonly wagerAmount: number,
    public readonly currency: string,
    public readonly playerChoice: string,
    public readonly outcome: string,
    public readonly result: GameResult,
    public readonly payoutAmount: number,
    public readonly createdAt: Date = new Date(),
    public readonly metadata?: GameRoundMetadata,
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.id) {
      throw new DomainError({ code: 'GAME_ROUND_INVALID_ID', message: 'Round id is required' });
    }
    if (!this.userId) {
      throw new DomainError({ code: 'GAME_ROUND_INVALID_USER', message: 'userId is required' });
    }
    if (!['COIN_FLIP'].includes(this.gameType)) {
      throw new DomainError({ code: 'GAME_ROUND_INVALID_TYPE', message: 'Unsupported game type' });
    }
    if (!Number.isFinite(this.wagerAmount) || this.wagerAmount <= 0) {
      throw new DomainError({ code: 'GAME_ROUND_INVALID_WAGER', message: 'Invalid wager amount' });
    }
    if (!this.currency) {
      throw new DomainError({ code: 'GAME_ROUND_INVALID_CURRENCY', message: 'Currency required' });
    }
    if (!['WIN', 'LOSE'].includes(this.result)) {
      throw new DomainError({ code: 'GAME_ROUND_INVALID_RESULT', message: 'Invalid result' });
    }
    if (!Number.isFinite(this.payoutAmount) || this.payoutAmount < 0) {
      throw new DomainError({
        code: 'GAME_ROUND_INVALID_PAYOUT',
        message: 'Invalid payout amount',
      });
    }
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      gameType: this.gameType,
      wagerAmount: this.wagerAmount,
      currency: this.currency,
      playerChoice: this.playerChoice,
      outcome: this.outcome,
      result: this.result,
      payoutAmount: this.payoutAmount,
      createdAt: this.createdAt.toISOString(),
      metadata: this.metadata,
    };
  }
}
