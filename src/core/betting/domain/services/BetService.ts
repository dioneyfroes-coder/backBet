//src/core/betting/domain/services/BetService.ts

import { Bet } from '../entities/Bet';
import { Event, Market } from '../entities/Event';
import { BetFactory } from '../factories/BetFactory';
import { IBetRepository } from '../repositories/IBetRepository';
import { IEventRepository } from '../repositories/IEventRepository';
import { IWalletService } from '@/core/finance/domain/services/IWalletService';
import { ICreateBetDTO, ICancelBetDTO, IResolveBetDTO } from '../../types/bet.types';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { Odds } from '@core/odds/domain/value-objects/Odds';
import { RiskService } from '@/core/risk/domain/services/RiskService';

export class BetService {
  constructor(
    private betRepository: IBetRepository,
    private eventRepository: IEventRepository,
    private walletService: IWalletService,
    private riskService?: RiskService,
  ) {}

  async placeBet(input: ICreateBetDTO): Promise<Bet> {
    const event = await this.getEventOrThrow(input.eventId);
    this.ensureEventAllowsBetting(event);

    const market = this.getMarketOrThrow(event, input.marketId);
    this.ensureMarketAllowsBetting(market);

    const odd = this.getOddOrThrow(market, input.oddId);

    // Risk check (if configured) before withdrawing funds
    if (this.riskService) {
      const allowed = await this.riskService.canPlaceBet(
        input.userId,
        input.amount,
        odd.value,
        input.eventId,
        input.marketId,
      );
      if (!allowed) {
        throw new DomainError({ code: 'RISK_REJECTED', message: 'Bet rejected by risk rules' });
      }
    }

    const wallet = await this.walletService.withdraw(input.userId, input.amount);

    const bet = BetFactory.createPendingBet({
      userId: input.userId,
      eventId: input.eventId,
      marketId: input.marketId,
      amount: input.amount,
      currency: wallet.currency ?? 'BRL',
      odds: odd,
      type: input.type,
    });

    await this.betRepository.create(bet);

    // register exposure (reserve) after successful creation
    if (this.riskService) {
      const liability = Number((bet.amount.value * (bet.odds.value - 1)).toFixed(2));
      await this.riskService.registerExposure(bet.userId, liability);
    }

    return bet;
  }

  async cancelBet(input: ICancelBetDTO): Promise<Bet> {
    const bet = await this.getBetOrThrow(input.betId);
    const event = await this.getEventOrThrow(bet.eventId);
    if (event.status !== 'SCHEDULED') {
      throw new DomainError({
        code: 'EVENT_NOT_CANCELABLE',
        message: 'Cannot cancel bet on ongoing or finished event',
        details: { status: event.status, eventId: event.id },
      });
    }

    bet.cancel(input.reason);

    // release exposure
    if (this.riskService) {
      const liability = Number((bet.amount.value * (bet.odds.value - 1)).toFixed(2));
      await this.riskService.reduceExposure(bet.userId, liability);
    }

    await this.walletService.deposit(bet.userId, bet.amount.value);
    await this.betRepository.update(bet);

    return bet;
  }

  async resolveBet(input: IResolveBetDTO): Promise<Bet> {
    const bet = await this.getBetOrThrow(input.betId);
    bet.resolve(input.result);

    // reduce exposure for resolved bet
    if (this.riskService) {
      const liability = Number((bet.amount.value * (bet.odds.value - 1)).toFixed(2));
      await this.riskService.reduceExposure(bet.userId, liability);
    }

    if (input.result === 'WON') {
      await this.walletService.deposit(bet.userId, bet.potentialReturn);
    }

    await this.betRepository.update(bet);
    return bet;
  }

  async getUserBets(userId: string): Promise<Bet[]> {
    return this.betRepository.findByUserId(userId);
  }

  async getEventBets(eventId: string): Promise<Bet[]> {
    return this.betRepository.findByEventId(eventId);
  }

  private async getEventOrThrow(eventId: string): Promise<Event> {
    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw new DomainError({
        code: 'EVENT_NOT_FOUND',
        message: 'Event not found',
        details: { eventId },
      });
    }
    return event;
  }

  private getMarketOrThrow(event: Event, marketId: string): Market {
    const market = event.markets.get(marketId);
    if (!market) {
      throw new DomainError({
        code: 'MARKET_NOT_FOUND',
        message: 'Market not found',
        details: { eventId: event.id, marketId },
      });
    }
    return market;
  }

  private getOddOrThrow(market: Market, oddId: string): Odds {
    const odd = market.odds.get(oddId);
    if (!odd) {
      throw new DomainError({
        code: 'ODD_NOT_FOUND',
        message: 'Odd not found',
        details: { marketId: market.id, oddId },
      });
    }
    return odd;
  }

  private async getBetOrThrow(betId: string): Promise<Bet> {
    const bet = await this.betRepository.findById(betId);
    if (!bet) {
      throw new DomainError({
        code: 'BET_NOT_FOUND',
        message: 'Bet not found',
        details: { betId },
      });
    }
    return bet;
  }

  private ensureEventAllowsBetting(event: Event): void {
    if (event.status !== 'SCHEDULED') {
      throw new DomainError({
        code: 'EVENT_NOT_OPEN_FOR_BETTING',
        message: 'Event is not open for betting',
        details: { status: event.status, eventId: event.id },
      });
    }
  }

  private ensureMarketAllowsBetting(market: Market): void {
    if (market.status !== 'OPEN') {
      throw new DomainError({
        code: 'MARKET_NOT_OPEN_FOR_BETTING',
        message: 'Market is not open for betting',
        details: { status: market.status, marketId: market.id },
      });
    }
  }
}
