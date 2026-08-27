import { Bet } from '../entities/Bet';
import { Money, SupportedCurrency } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@core/odds/domain/value-objects/Odds';
import { BetType } from '../../types/bet.types';
import { UniqueId } from '@/core/shared/domain/value-objects/UniqueId';

export type CreatePendingBetInput = {
  userId: string;
  eventId: string;
  marketId: string;
  amount: number;
  currency: string;
  odds: Odds;
  type: BetType;
  betIdFactory?: () => string;
  timestampFactory?: () => Date;
};

export class BetFactory {
  static createPendingBet({
    userId,
    eventId,
    marketId,
    amount,
    currency,
    odds,
    type,
    betIdFactory,
    timestampFactory,
  }: CreatePendingBetInput): Bet {
    const id = betIdFactory ? betIdFactory() : new UniqueId().value;
    const createdAt = timestampFactory ? timestampFactory() : new Date();

    return new Bet(
      id,
      userId,
      eventId,
      marketId,
      new Money(amount, currency as SupportedCurrency),
      odds,
      'PENDING',
      type,
      createdAt,
      new Date(0),
      '',
    );
  }
}
