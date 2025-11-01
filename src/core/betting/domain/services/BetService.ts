//src/core/betting/domain/services/BetService.ts

import { randomUUID } from 'crypto';
import { Bet } from '../entities/Bet';
import { IBetRepository } from '../repositories/IBetRepository';
import { IEventRepository } from '../repositories/IEventRepository';
import { BetAmount } from '../value-objects/BetAmount';
import { IWalletService } from '@/core/finance/domain/services/IWalletService';
import { ICreateBetDTO, ICancelBetDTO, IResolveBetDTO } from '../../types/bet.types';

export class BetService {
  constructor(
    private betRepository: IBetRepository,
    private eventRepository: IEventRepository,
    private walletService: IWalletService,
  ) {}

  async placeBet(input: ICreateBetDTO): Promise<Bet> {
    const event = await this.eventRepository.findById(input.eventId);
    if (!event) throw new Error('Event not found');
    if (event.status !== 'SCHEDULED') throw new Error('Event is not open for betting');

    const market = event.markets.get(input.marketId);
    if (!market) throw new Error('Market not found');
    if (market.status !== 'OPEN') throw new Error('Market is not open for betting');

    const odd = market.odds.get(input.oddId);
    if (!odd) throw new Error('Odd not found');

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
    if (!bet) throw new Error('Bet not found');
    if (bet.status !== 'PENDING') throw new Error('Bet cannot be canceled');

    const event = await this.eventRepository.findById(bet.eventId);
    if (!event) throw new Error('Event not found');
    if (event.status !== 'SCHEDULED')
      throw new Error('Cannot cancel bet on ongoing or finished event');

    bet.cancel(input.reason);
    await this.walletService.deposit(bet.userId, bet.amount.value);
    await this.betRepository.update(bet);

    return bet;
  }

  async resolveBet(input: IResolveBetDTO): Promise<Bet> {
    const bet = await this.betRepository.findById(input.betId);
    if (!bet) throw new Error('Bet not found');
    if (bet.status !== 'PENDING') throw new Error('Bet is not pending');

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
