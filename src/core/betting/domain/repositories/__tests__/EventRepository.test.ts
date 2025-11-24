import { EventRepository } from '../../repositories/EventRepository';
import { Event, Market } from '../../entities/Event';
import { Odds } from '../../value-objects/Odds';

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

  it('placeholder query helpers return empty arrays', async () => {
    expect(await repository.findByStatus()).toEqual([]);
    expect(await repository.findByCategory()).toEqual([]);
    expect(await repository.findUpcoming()).toEqual([]);
  });
});
