import { BetRepository } from '../../repositories/BetRepository';
import { Bet } from '../../entities/Bet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@core/odds/domain/value-objects/Odds';

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
      new Money(10, 'BRL'),
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
    expect((await repo.findById('bet-a'))?.id).toBe(bet.id);
    expect((await repo.findByUserId('user-a')).map((item) => item.id)).toContain(bet.id);
  });

  it('updates an existing bet and deletes it', async () => {
    await repo.create(bet);
    const stored = await repo.findById('bet-a');
    stored!.resolve('WON');
    stored!.incrementVersion();
    await repo.update(stored!);
    const updated = await repo.findById('bet-a');
    expect(updated?.status).toBe('WON');
    expect(await repo.delete('bet-a')).toBe(true);
    expect(await repo.findById('bet-a')).toBeNull();
  });

  it('returns empty arrays when filters miss', async () => {
    expect(await repo.findByEventId('none')).toEqual([]);
    expect(await repo.findByUserId('none')).toEqual([]);
  });

  it('rejects a stale concurrent bet update', async () => {
    await repo.create(bet);
    const firstRead = await repo.findById(bet.id);
    const secondRead = await repo.findById(bet.id);

    firstRead!.resolve('WON');
    firstRead!.incrementVersion();
    secondRead!.resolve('LOST');
    secondRead!.incrementVersion();

    await repo.update(firstRead!);
    await expect(repo.update(secondRead!)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    const persisted = await repo.findById(bet.id);
    expect(persisted?.status).toBe('WON');
    expect(persisted?.version).toBe(2);
  });

  it('ignores updates for unknown bets', async () => {
    await expect(repo.update(bet)).resolves.toBeUndefined();
    expect(await repo.findById(bet.id)).toBeNull();
  });

  it('findByStatus returns only bets with the given status', async () => {
    const won = new Bet(
      'bet-b',
      'user-b',
      'event-a',
      'market-a',
      new Money(5, 'BRL'),
      new Odds(2),
      'WON',
      'SINGLE',
      new Date(),
      new Date(),
      '',
    );
    await repo.create(bet);
    await repo.create(won);
    expect(await repo.findByStatus('PENDING')).toHaveLength(1);
    expect((await repo.findByStatus('PENDING'))[0].id).toBe('bet-a');
    expect(await repo.findByStatus('WON')).toHaveLength(1);
    expect(await repo.findByStatus('LOST')).toEqual([]);
  });
});
