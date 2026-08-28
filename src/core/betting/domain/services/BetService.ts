//src/core/betting/domain/services/BetService.ts

import { Bet } from '../entities/Bet';
import { Event, Market } from '../entities/Event';
import { BetFactory } from '../factories/BetFactory';
import { IBetRepository, BetRepositoryOptions } from '../repositories/IBetRepository';
import { IEventRepository } from '../repositories/IEventRepository';
import { IWalletService } from '@/core/finance/domain/services/IWalletService';
import { ICreateBetDTO, ICancelBetDTO, IResolveBetDTO } from '../../types/bet.types';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { Odds } from '@core/odds/domain/value-objects/Odds';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { TransactionRunner, TransactionSession } from '@/core/shared/types/Transaction';
import { WalletRepositoryOptions } from '@/core/finance/domain/repositories/IWalletRepository';
import { UniqueId } from '@/core/shared/domain/value-objects/UniqueId';
import { appConfig } from '@/shared/config/appConfig';

export class BetService {
  constructor(
    private betRepository: IBetRepository,
    private eventRepository: IEventRepository,
    private walletService: IWalletService,
    private riskService?: RiskService,
    private transactionRunner?: TransactionRunner,
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

    const operation = async (session?: TransactionSession) => {
      const options: WalletRepositoryOptions | undefined = session ? { session } : undefined;
      const betId = new UniqueId().value;
      const wallet = options
        ? await this.walletService.withdraw(
            input.userId,
            input.amount,
            { type: 'BET_DEBIT', referenceId: betId, source: 'BET' },
            options,
          )
        : await this.walletService.withdraw(input.userId, input.amount, {
            type: 'BET_DEBIT',
            referenceId: betId,
            source: 'BET',
          });
      const bet = BetFactory.createPendingBet({
        userId: input.userId,
        eventId: input.eventId,
        marketId: input.marketId,
        amount: input.amount,
        currency: wallet.currency ?? 'BRL',
        odds: odd,
        type: input.type,
        betIdFactory: () => betId,
      });
      if (session) await this.betRepository.create(bet, { session });
      else await this.betRepository.create(bet);
      if (this.riskService) {
        const liabilityCents = bet.odds.calculateLiability(bet.amount).getCents();
        const riskOptions = options ?? undefined;
        const userReserved = await this.riskService.reserveExposure(
          bet.userId,
          liabilityCents,
          riskOptions,
        );
        const eventReserved = await this.riskService.reserveEventExposure(
          bet.eventId,
          liabilityCents,
          riskOptions,
        );
        const marketReserved = await this.riskService.reserveMarketExposure(
          bet.marketId,
          liabilityCents,
          riskOptions,
        );
        if (!userReserved || !eventReserved || !marketReserved) {
          throw new DomainError({
            code: 'RISK_LIMIT_EXCEEDED',
            message: 'Bet rejected: exposure limit would be exceeded',
            details: { liabilityCents, userReserved, eventReserved, marketReserved },
          });
        }
      }
      return bet;
    };
    const bet = this.transactionRunner
      ? await this.transactionRunner.withTransaction(operation)
      : await operation();

    return bet;
  }

  async cancelBet(input: ICancelBetDTO): Promise<Bet> {
    const operation = async (session?: TransactionSession) => {
      const bet = await this.getBetOrThrow(input.betId, session ? { session } : undefined);
      const actorIsAdmin = appConfig.admin.allowedUserIds.includes(input.canceledBy);
      if (input.canceledBy !== bet.userId && !actorIsAdmin) {
        throw new DomainError({
          code: 'BET_NOT_OWNER',
          message: 'Cannot cancel a bet from another user',
          details: { betId: bet.id, requestedBy: input.canceledBy },
        });
      }
      const event = await this.getEventOrThrow(bet.eventId);
      if (event.status !== 'SCHEDULED') {
        throw new DomainError({
          code: 'EVENT_NOT_CANCELABLE',
          message: 'Cannot cancel bet on ongoing or finished event',
          details: { status: event.status, eventId: event.id },
        });
      }
      bet.cancel(input.reason);
      if (this.riskService) {
        const liabilityCents = bet.odds.calculateLiability(bet.amount).getCents();
        const riskOptions = session ? { session } : undefined;
        await this.riskService.reduceExposure(bet.userId, liabilityCents, riskOptions);
        await this.riskService.reduceEventExposure(bet.eventId, liabilityCents, riskOptions);
        await this.riskService.reduceMarketExposure(bet.marketId, liabilityCents, riskOptions);
      }
      const options: WalletRepositoryOptions | undefined = session ? { session } : undefined;
      if (options)
        await this.walletService.deposit(
          bet.userId,
          bet.amount.amount,
          { type: 'BET_REFUND', referenceId: bet.id, source: 'BET' },
          options,
        );
      else
        await this.walletService.deposit(bet.userId, bet.amount.amount, {
          type: 'BET_REFUND',
          referenceId: bet.id,
          source: 'BET',
        });
      bet.incrementVersion();
      if (session) await this.betRepository.update(bet, { session });
      else await this.betRepository.update(bet);
      return bet;
    };
    return this.transactionRunner
      ? this.transactionRunner.withTransaction(operation)
      : operation();
  }

  async resolveBet(input: IResolveBetDTO): Promise<Bet> {
    const operation = async (session?: TransactionSession) => {
      const bet = await this.getBetOrThrow(input.betId, session ? { session } : undefined);
      bet.resolve(input.result);
      if (this.riskService) {
        const liabilityCents = bet.odds.calculateLiability(bet.amount).getCents();
        const riskOptions = session ? { session } : undefined;
        await this.riskService.reduceExposure(bet.userId, liabilityCents, riskOptions);
        await this.riskService.reduceEventExposure(bet.eventId, liabilityCents, riskOptions);
        await this.riskService.reduceMarketExposure(bet.marketId, liabilityCents, riskOptions);
      }
      if (input.result === 'WON') {
        const options: WalletRepositoryOptions | undefined = session ? { session } : undefined;
        if (options)
          await this.walletService.deposit(
            bet.userId,
            bet.potentialReturn,
            { type: 'BET_WIN', referenceId: bet.id, source: 'BET' },
            options,
          );
        else
          await this.walletService.deposit(bet.userId, bet.potentialReturn, {
            type: 'BET_WIN',
            referenceId: bet.id,
            source: 'BET',
          });
      }
      bet.incrementVersion();
      if (session) await this.betRepository.update(bet, { session });
      else await this.betRepository.update(bet);
      return bet;
    };
    return this.transactionRunner
      ? this.transactionRunner.withTransaction(operation)
      : operation();
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

  private async getBetOrThrow(betId: string, options?: BetRepositoryOptions): Promise<Bet> {
    const bet = options
      ? await this.betRepository.findById(betId, options)
      : await this.betRepository.findById(betId);
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
