//src/core/betting/domain/services/BetService.ts

import { randomUUID } from 'crypto';
import { Bet } from '../entities/Bet';
import { IBetRepository } from '../repositories/IBetRepository';
import { IEventRepository } from '../repositories/IEventRepository';
import { BetAmount } from '../value-objects/BetAmount';
import { IWalletService } from '@/core/finance/domain/services/IWalletService';
import { ICreateBetDTO, ICancelBetDTO, IResolveBetDTO } from '../../types/bet.types';
import { AppError } from '@/shared/errors/AppError';

export class BetService {
  constructor(
    private betRepository: IBetRepository,
    private eventRepository: IEventRepository,
    private walletService: IWalletService,
  ) {}

  async placeBet(input: ICreateBetDTO): Promise<Bet> {
    const event = await this.eventRepository.findById(input.eventId);
  if (!event) throw new AppError('NOT_FOUND', 'Event not found', 404);
  if (event.status !== 'SCHEDULED') throw new AppError('BAD_REQUEST', 'Event is not open for betting', 400);

    const market = event.markets.get(input.marketId);
  if (!market) throw new AppError('NOT_FOUND', 'Market not found', 404);
  if (market.status !== 'OPEN') throw new AppError('BAD_REQUEST', 'Market is not open for betting', 400);

    const odd = market.odds.get(input.oddId);
  if (!odd) throw new AppError('NOT_FOUND', 'Odd not found', 404);

  const wallet = await this.walletService.withdraw(input.userId, input.amount);

    const bet = new Bet(
      randomUUID(),
      input.userId,
      input.eventId,
      input.marketId,
      new BetAmount(input.amount, wallet.currency ?? 'BRL'),
      odd,
      'PENDING',
      input.type,
      new Date(),
      new Date(0),
      '',
    );

    await this.betRepository.create(bet);
    return bet;
  }

  async cancelBet(input: ICancelBetDTO): Promise<Bet> {
  const bet = await this.betRepository.findById(input.betId);
  if (!bet) throw new AppError('NOT_FOUND', 'Bet not found', 404);
  if (bet.status !== 'PENDING') throw new AppError('BAD_REQUEST', 'Bet cannot be canceled', 400);

    const event = await this.eventRepository.findById(bet.eventId);
    if (!event) throw new AppError('NOT_FOUND', 'Event not found', 404);
    if (event.status !== 'SCHEDULED')
      throw new AppError('BAD_REQUEST', 'Cannot cancel bet on ongoing or finished event', 400);

    bet.cancel(input.reason);
    await this.walletService.deposit(bet.userId, bet.amount.value);
    await this.betRepository.update(bet);

    return bet;
  }

  async resolveBet(input: IResolveBetDTO): Promise<Bet> {
  const bet = await this.betRepository.findById(input.betId);
  if (!bet) throw new AppError('NOT_FOUND', 'Bet not found', 404);
  if (bet.status !== 'PENDING') throw new AppError('BAD_REQUEST', 'Bet is not pending', 400);

    bet.resolve(input.result);

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
}
