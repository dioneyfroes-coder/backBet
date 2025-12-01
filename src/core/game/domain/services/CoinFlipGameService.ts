import { randomUUID } from 'crypto';
import { CoinFlipChoice, GameRound } from '../entities/GameRound';
import { CoinFlipEngine } from './CoinFlipEngine';
import { IGameRoundRepository } from '../repositories/IGameRoundRepository';
import { GameIntegrationPort } from '../ports/GameIntegrationPort';
import { IWalletService } from '@/core/finance/domain/services/IWalletService';
import { DomainError } from '@/core/shared/domain/errors/DomainError';

export type CoinFlipConfig = {
  enabled?: boolean;
  minBet: number;
  maxBet: number;
  fixedWinAmount?: number;
  payoutMultiplier: number;
};

export type PlayCoinFlipInput = {
  userId: string;
  choice: CoinFlipChoice;
  wager: number;
};

export class CoinFlipGameService {
  constructor(
    private readonly walletService: IWalletService,
    private readonly engine: CoinFlipEngine,
    private readonly repository: IGameRoundRepository,
    private readonly integrationPort: GameIntegrationPort,
    private readonly config: CoinFlipConfig,
  ) {}

  async play(input: PlayCoinFlipInput): Promise<GameRound> {
    if (this.config.enabled === false) {
      throw new DomainError({ code: 'GAME_DISABLED', message: 'Coin flip game is disabled' });
    }
    this.ensureBetLimits(input.wager);

    const wallet = await this.walletService.withdraw(input.userId, input.wager);
    const result = this.engine.play({ choice: input.choice });

    const payout = this.calculatePayout(input.wager);
    if (result.win) {
      const totalReturn = Number((input.wager + payout).toFixed(2));
      await this.walletService.deposit(input.userId, totalReturn);
    }

    const round = new GameRound(
      randomUUID(),
      input.userId,
      'COIN_FLIP',
      Number(input.wager.toFixed(2)),
      wallet.currency ?? 'BRL',
      input.choice,
      result.outcome,
      result.win ? 'WIN' : 'LOSE',
      result.win ? payout : 0,
      new Date(),
      { engine: 'builtin.coinFlip' },
    );

    await this.repository.create(round);
    await this.integrationPort.notifyRound(round);
    if (this.integrationPort.broadcastFeed) {
      const recent = await this.repository.findRecent(10);
      await this.integrationPort.broadcastFeed(recent);
    }

    return round;
  }

  private ensureBetLimits(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new DomainError({ code: 'GAME_INVALID_WAGER', message: 'Valor da aposta inválido' });
    }
    if (amount < this.config.minBet) {
      throw new DomainError({
        code: 'GAME_WAGER_TOO_LOW',
        message: `Aposta mínima: ${this.config.minBet}`,
      });
    }
    if (amount > this.config.maxBet) {
      throw new DomainError({
        code: 'GAME_WAGER_TOO_HIGH',
        message: `Aposta máxima: ${this.config.maxBet}`,
      });
    }
  }

  private calculatePayout(wager: number): number {
    if (this.config.fixedWinAmount && this.config.fixedWinAmount > 0) {
      return Number(this.config.fixedWinAmount.toFixed(2));
    }
    return Number((wager * this.config.payoutMultiplier).toFixed(2));
  }
}
