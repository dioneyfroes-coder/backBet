import { GameRound } from '@/core/game/domain/entities/GameRound';
import { DomainError } from '@/core/shared/domain/errors/DomainError';

describe('GameRound', () => {
  it('should create a valid round and expose JSON representation', () => {
    const round = new GameRound(
      'round-1',
      'user-1',
      'COIN_FLIP',
      10,
      'BRL',
      'HEADS',
      'TAILS',
      'LOSE',
      0,
      new Date('2025-11-30T10:00:00.000Z'),
      { engine: 'test' },
    );

    expect(round.toJSON()).toEqual({
      id: 'round-1',
      userId: 'user-1',
      gameType: 'COIN_FLIP',
      wagerAmount: 10,
      currency: 'BRL',
      playerChoice: 'HEADS',
      outcome: 'TAILS',
      result: 'LOSE',
      payoutAmount: 0,
      createdAt: '2025-11-30T10:00:00.000Z',
      metadata: { engine: 'test' },
    });
  });

  it('normalizes wager and payout to cents', () => {
    const round = new GameRound(
      'round-2', 'user-1', 'COIN_FLIP', 0.1, 'BRL', 'HEADS', 'HEADS', 'WIN', 0.2,
    );

    expect(round.wagerAmount).toBe(0.1);
    expect(round.payoutAmount).toBe(0.2);
  });

  it.each([
    ['invalid wager', () => new GameRound('id', 'user', 'COIN_FLIP', 0, 'BRL', 'H', 'H', 'WIN', 1)],
    [
      'invalid type',
      () => new GameRound('id', 'user', 'INVALID' as any, 10, 'BRL', 'H', 'H', 'WIN', 1),
    ],
    [
      'invalid payout',
      () => new GameRound('id', 'user', 'COIN_FLIP', 10, 'BRL', 'H', 'H', 'WIN', -1),
    ],
  ])('should throw DomainError for %s', (_label, factory) => {
    expect(factory).toThrow(DomainError);
  });
});
