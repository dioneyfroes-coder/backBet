export type BetStatus = 'PENDING' | 'WON' | 'LOST' | 'CANCELED';
export type BetType = 'SINGLE' | 'MULTIPLE';
export type EventStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CANCELED';
export type MarketStatus = 'OPEN' | 'SUSPENDED' | 'CLOSED';
export type OddStatus = 'ACTIVE' | 'SUSPENDED';

export interface ICreateBetDTO {
  userId: string;
  eventId: string;
  marketId: string;
  oddId: string;
  amount: number;
  type: BetType;
}

export interface ICancelBetDTO {
  betId: string;
  reason: string;
  canceledBy: string;
}

export interface IResolveBetDTO {
  betId: string;
  result: 'WON' | 'LOST';
  marketResult: string;
}