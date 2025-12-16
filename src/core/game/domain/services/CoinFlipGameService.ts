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
  cooldownMs?: number;
};

export type PlayCoinFlipInput = {
  userId: string;
  choice: CoinFlipChoice;
  wager: number;
};

export class CoinFlipGameService {
  private async ensureCooldown(userId: string): Promise<void> {
    const cooldownMs = this.config.cooldownMs || 0;
    if (cooldownMs <= 0) return;
    const rounds = await this.repository.findByUser(userId, 1);
    if (rounds.length > 0) {
      const lastRound = rounds[0];
      const now = Date.now();
      const last = new Date(lastRound.createdAt).getTime();
      if (now - last < cooldownMs) {
        throw new DomainError({
          code: 'GAME_COOLDOWN',
          message: `Aguarde ${Math.ceil((cooldownMs - (now - last)) / 1000)}s para apostar novamente.`,
        });
      }
    }
  }
  constructor(
    private readonly walletService: IWalletService,
    private readonly engine: CoinFlipEngine,
    private readonly repository: IGameRoundRepository,
    private readonly integrationPort: GameIntegrationPort,
    private readonly config: CoinFlipConfig,
  ) {}

  async play(input: PlayCoinFlipInput): Promise<GameRound> {
    await this.ensureCooldown(input.userId);
    if (this.config.enabled === false) {
      throw new DomainError({ code: 'GAME_DISABLED', message: 'Coin flip game is disabled' });
    }
    this.ensureBetLimits(input.wager);

    // Verifica saldo suficiente antes de debitar, se método existir (para compatibilidade com mocks de teste)
    let updatedWallet;
    if (typeof this.walletService.findByUserId === 'function') {
      const wallet = await this.walletService.findByUserId(input.userId);
      if (!wallet || wallet.balance < input.wager) {
        throw new DomainError({
          code: 'WALLET_INSUFFICIENT_FUNDS',
          message: 'Saldo insuficiente para apostar',
        });
      }
      // Lock temporário do valor apostado
      updatedWallet = await this.walletService.lock(input.userId, input.wager);
    } else {
      // fallback para mocks antigos
      updatedWallet = await this.walletService.lock(input.userId, input.wager);
    }

    const result = this.engine.play({ choice: input.choice });
    const payout = this.calculatePayout(input.wager);

    // Libera o valor "preso" e faz o fluxo de crédito/desbloqueio
    if (result.win) {
      // Retira o valor travado e credita prêmio + aposta
      await this.walletService.withdrawLocked(input.userId, input.wager);
      const totalReturn = Number((input.wager + payout).toFixed(2));
      await this.walletService.deposit(input.userId, totalReturn);
    } else {
      // Apenas retira o valor travado (aposta perdida)
      await this.walletService.withdrawLocked(input.userId, input.wager);
    }

    const round = new GameRound(
      randomUUID(),
      input.userId,
      'COIN_FLIP',
      Number(input.wager.toFixed(2)),
      updatedWallet.currency ?? 'BRL',
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
