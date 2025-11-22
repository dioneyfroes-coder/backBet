import { BetRepository } from '../../repositories/BetRepository';
import { Bet } from '../../entities/Bet';
import { BetAmount } from '../../value-objects/BetAmount';
import { Odds } from '../../value-objects/Odds';

describe('BetRepository in-memory', () => {
  let repo: BetRepository;
  let bet: Bet;

  beforeEach(() => {
    repo = new BetRepository();
    bet = new Bet(
      'bet-a',
      'user-a',
      'event-a',
      'market-a',
      new BetAmount(10, 'BRL'),
      new Odds(1.5),
      'PENDING',
      'SINGLE',
      new Date(),
      new Date(0),
      '',
    );
  });

  it('creates and finds a bet', async () => {
    await repo.create(bet);
    expect(await repo.findById('bet-a')).toBe(bet);
    expect(await repo.findByUserId('user-a')).toContain(bet);
  });

  it('updates an existing bet and deletes it', async () => {
    await repo.create(bet);
    bet.resolve('WON');
    await repo.update(bet);
    const updated = await repo.findById('bet-a');
    expect(updated?.status).toBe('WON');
    expect(await repo.delete('bet-a')).toBe(true);
    expect(await repo.findById('bet-a')).toBeNull();
  });

  it('returns empty arrays when filters miss', async () => {
    expect(await repo.findByEventId('none')).toEqual([]);
    expect(await repo.findByUserId('none')).toEqual([]);
  });
});
