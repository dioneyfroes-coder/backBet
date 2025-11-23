import { BetFactory } from '../BetFactory';
import { Odds } from '../../value-objects/Odds';

describe('BetFactory', () => {
  it('uses provided id and timestamp factories when available', () => {
    const bet = BetFactory.createPendingBet({
      userId: 'user-1',
      eventId: 'event-1',
      marketId: 'market-1',
      amount: 100,
      currency: 'BRL',
      odds: new Odds(2),
      type: 'SINGLE',
      betIdFactory: () => 'custom-id',
      timestampFactory: () => new Date('2024-01-01T00:00:00Z'),
    });

    expect(bet.id).toBe('custom-id');
    expect(bet.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(bet.status).toBe('PENDING');
  });

  it('falls back to UniqueId and Date when factories are absent', () => {
    const bet = BetFactory.createPendingBet({
      userId: 'user-1',
      eventId: 'event-1',
      marketId: 'market-1',
      amount: 50,
      currency: 'USD',
      odds: new Odds(1.8),
      type: 'MULTIPLE',
    });

    expect(bet.id).toMatch(/^.{8,}/);
    expect(bet.createdAt).toBeInstanceOf(Date);
  });
});
