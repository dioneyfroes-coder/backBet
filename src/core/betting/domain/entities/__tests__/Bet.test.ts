import { Bet } from '../Bet';
import { BetAmount } from '../../value-objects/BetAmount';
import { Odds } from '../../value-objects/Odds';

const makeBet = (): Bet => {
  const amount = new BetAmount(100, 'BRL');
  const odds = new Odds(2.0);
  return new Bet(
    'bet-1',
    'user-1',
    'event-1',
    'market-1',
    amount,
    odds,
    'PENDING',
    'SINGLE',
    new Date(),
    undefined as unknown as Date,
    '',
  );
};

describe('Bet entity', () => {
  it('resolves and calculates potential return', () => {
    const bet = makeBet();
    bet.resolve('WON');

    expect(bet.status).toBe('WON');
    expect(bet.resolvedAt).toBeInstanceOf(Date);
    expect(bet.potentialReturn).toBe(200);
  });

  it('cancels and records reason', () => {
    const bet = makeBet();
    bet.cancel('change of mind');

    expect(bet.status).toBe('CANCELED');
    expect(bet.cancellationReason).toBe('change of mind');
    expect(bet.resolvedAt).toBeInstanceOf(Date);
  });

  it('throws if resolving twice or canceling after resolution', () => {
    const bet = makeBet();
    bet.resolve('LOST');
    expect(() => bet.resolve('WON')).toThrow('Only pending bets can be resolved.');
    expect(() => bet.cancel('nope')).toThrow('Only pending bets can be canceled.');
  });

  it('fails validation for empty IDs', () => {
    expect(
      () =>
        new Bet(
          '',
          'user-1',
          'event-1',
          'market-1',
          new BetAmount(50, 'BRL'),
          new Odds(1.5),
          'PENDING',
          'SINGLE',
          new Date(),
          new Date(0),
          '',
        ),
    ).toThrow('Invalid bet ID');
  });

  it('fails validation for missing reference identifiers', () => {
    const baseArgs = [
      { field: 'userId', value: '' },
      { field: 'eventId', value: '   ' },
      { field: 'marketId', value: null },
    ] as const;

    baseArgs.forEach(({ field, value }) => {
      const args = {
        id: 'bet-1',
        userId: 'user-1',
        eventId: 'event-1',
        marketId: 'market-1',
        amount: new BetAmount(50, 'BRL'),
        odds: new Odds(1.5),
        status: 'PENDING' as const,
        type: 'SINGLE' as const,
        createdAt: new Date(),
        resolvedAt: undefined as unknown as Date,
        cancellationReason: '',
      } as Record<string, any>;

      args[field] = value;
      expect(
        () =>
          new Bet(
            args.id,
            args.userId,
            args.eventId,
            args.marketId,
            args.amount,
            args.odds,
            args.status,
            args.type,
            args.createdAt,
            args.resolvedAt,
            args.cancellationReason,
          ),
      ).toThrow(
        field === 'marketId'
          ? 'Invalid market ID'
          : field === 'eventId'
            ? 'Invalid event ID'
            : 'Invalid user ID',
      );
    });
  });

  it('fails validation for incorrect dates', () => {
    expect(
      () =>
        new Bet(
          'bet-1',
          'user-1',
          'event-1',
          'market-1',
          new BetAmount(40, 'BRL'),
          new Odds(1.5),
          'PENDING',
          'SINGLE',
          'invalid' as unknown as Date,
          undefined as unknown as Date,
          '',
        ),
    ).toThrow('Invalid creation date');

    expect(
      () =>
        new Bet(
          'bet-1',
          'user-1',
          'event-1',
          'market-1',
          new BetAmount(40, 'BRL'),
          new Odds(1.5),
          'PENDING',
          'SINGLE',
          new Date(),
          'not-a-date' as unknown as Date,
          '',
        ),
    ).toThrow('Invalid resolution date');
  });

  it('serializes to JSON including derived potential return', () => {
    const bet = makeBet();

    expect(bet.toJSON()).toMatchObject({
      id: 'bet-1',
      userId: 'user-1',
      marketId: 'market-1',
      status: 'PENDING',
      type: 'SINGLE',
      amount: 100,
      odds: 2,
      potentialReturn: 200,
    });
  });
});
