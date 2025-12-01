import { EventRepository } from '../../repositories/EventRepository';
import { Event, Market } from '../../entities/Event';
import { Odds } from '@core/odds/domain/value-objects/Odds';

describe('EventRepository in-memory', () => {
  const buildEvent = (id: string) =>
    new Event(
      id,
      `Event ${id}`,
      new Date(),
      'SCHEDULED',
      'Football',
      ['Home', 'Away'],
      new Map([
        ['market-1', new Market('market-1', 'Winner', 'OPEN', new Map([['odd-1', new Odds(2)]]))],
      ]),
    );

  let repository: EventRepository;

  beforeEach(() => {
    repository = new EventRepository();
  });

  it('stores, finds, updates and deletes events', async () => {
    const event = buildEvent('event-1');
    await repository.create(event);
    expect(await repository.findById('event-1')).toBe(event);

    const updated = buildEvent('event-1');
    updated.start();
    await repository.update(updated);
    expect((await repository.findById('event-1'))?.status).toBe('LIVE');

    expect(await repository.delete('event-1')).toBe(true);
    expect(await repository.findById('event-1')).toBeNull();
  });

  it('returns null/false when no event found', async () => {
    expect(await repository.findById('missing')).toBeNull();
    expect(await repository.delete('missing')).toBe(false);
  });

  it('filters by status, category and upcoming window', async () => {
    const scheduled = await repository.findByStatus('SCHEDULED');
    expect(scheduled.length).toBeGreaterThan(0);
    expect(scheduled.every((event) => event.status === 'SCHEDULED')).toBe(true);

    const football = await repository.findByCategory('Football');
    expect(football.length).toBe(1);
    expect(football[0].category).toBe('Football');

    const upcoming = await repository.findUpcoming();
    const timestamps = upcoming.map((event) => event.startDate.getTime());
    expect(upcoming.every((event) => event.status === 'SCHEDULED')).toBe(true);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });
});
