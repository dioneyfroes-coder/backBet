import { restoreBet } from '../restoreBet';
import { Bet } from '../../../domain/entities/Bet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@core/odds/domain/value-objects/Odds';

const makeBet = (id = 'bet-1'): Bet =>
  new Bet(
    id,
    'user-1',
    'event-1',
    'market-a',
    new Money(100, 'BRL'),
    new Odds(2),
    'PENDING',
    'SINGLE',
    new Date('2026-09-22T10:00:00.000Z'),
  );

describe('restoreBet', () => {
  it('devolve a própria instância quando o raw já é um Bet', () => {
    const bet = makeBet();
    expect(restoreBet(bet)).toBe(bet);
  });

  it('hidrata um objeto serializado completo com todos os campos', () => {
    const restored = restoreBet({
      id: 'bet-9',
      userId: 'user-9',
      eventId: 'event-9',
      marketId: 'market-9',
      amount: 50,
      odds: 3.5,
      status: 'LOST',
      type: 'SINGLE',
      createdAt: '2026-09-21T08:30:00.000Z',
      resolvedAt: '2026-09-21T09:00:00.000Z',
      cancellationReason: 'manual',
      version: 4,
      oddId: 'odd-99',
    });

    expect(restored).toBeInstanceOf(Bet);
    expect(restored.id).toBe('bet-9');
    expect(restored.userId).toBe('user-9');
    expect(restored.eventId).toBe('event-9');
    expect(restored.marketId).toBe('market-9');
    expect(restored.oddId).toBe('odd-99');
    expect(restored.amount.amount).toBe(50);
    expect(restored.odds.value).toBe(3.5);
    expect(restored.status).toBe('LOST');
    expect(restored.type).toBe('SINGLE');
    expect(restored.createdAt.toISOString()).toBe('2026-09-21T08:30:00.000Z');
    expect(restored.resolvedAt?.toISOString()).toBe('2026-09-21T09:00:00.000Z');
    expect(restored.cancellationReason).toBe('manual');
    expect(restored.version).toBe(4);
  });

  it('aplica defaults para status/type/version/oddId/cancellationReason/resolvedAt', () => {
    const restored = restoreBet({
      id: 'bet-1',
      userId: 'user-1',
      eventId: 'event-1',
      marketId: 'market-1',
      amount: 10,
      odds: 2,
    });

    expect(restored.status).toBe('PENDING');
    expect(restored.type).toBe('SINGLE');
    expect(restored.resolvedAt).toBeUndefined();
    expect(restored.cancellationReason).toBeUndefined();
    expect(restored.version).toBe(1);
    expect(restored.oddId).toBe('');
    expect(restored.createdAt).toBeInstanceOf(Date);
    expect(Number.isNaN(restored.createdAt.getTime())).toBe(true);
  });

  it('preserva version 0 (0 ?? 1 === 0)', () => {
    const restored = restoreBet({
      id: 'bet-1',
      userId: 'user-1',
      eventId: 'event-1',
      marketId: 'market-1',
      amount: 10,
      odds: 2,
      version: 0,
      createdAt: '2026-09-21T00:00:00.000Z',
    });
    expect(restored.version).toBe(0);
  });

  it('resolvedAt/cancellationReason null viram undefined', () => {
    const restored = restoreBet({
      id: 'bet-1',
      userId: 'user-1',
      eventId: 'event-1',
      marketId: 'market-1',
      amount: 10,
      odds: 2,
      createdAt: '2026-09-21T00:00:00.000Z',
      resolvedAt: null,
      cancellationReason: null,
    });

    expect(restored.resolvedAt).toBeUndefined();
    expect(restored.cancellationReason).toBeUndefined();
  });

  it('id ausente cai no default vazio e a validação lança BET_INVALID_ID', () => {
    expect(() =>
      restoreBet({
        userId: 'user-1',
        eventId: 'event-1',
        marketId: 'market-1',
        amount: 10,
        odds: 2,
      }),
    ).toThrow('Invalid bet ID');
  });

  it('amount ausente cai no default 0 e lança BET_AMOUNT_NON_POSITIVE', () => {
    expect(() =>
      restoreBet({
        id: 'bet-1',
        userId: 'user-1',
        eventId: 'event-1',
        marketId: 'market-1',
        odds: 2,
      }),
    ).toThrow('Bet amount must be greater than 0');
  });

  it('odds ausente cai no default 0 e o VO Odds rejeita', () => {
    expect(() =>
      restoreBet({
        id: 'bet-1',
        userId: 'user-1',
        eventId: 'event-1',
        marketId: 'market-1',
        amount: 10,
      }),
    ).toThrow('Odds must be greater than or equal to 1.01');
  });
});