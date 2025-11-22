import { Market } from '../Event';
import { Event } from '../Event';
import { Odds } from '../../value-objects/Odds';

describe('Market domain behavior', () => {
  const createMarket = (status: 'OPEN' | 'SUSPENDED' | 'CLOSED' = 'OPEN') =>
    new Market('market-1', 'Winner', status, new Map([['odd-1', new Odds(2.0)]]));

  it('suspends and opens markets correctly', () => {
    const market = createMarket('OPEN');
    market.suspend();
    expect(market.status).toBe('SUSPENDED');
    market.open();
    expect(market.status).toBe('OPEN');
  });

  it('sets result when closing and prevents duplicate operations', () => {
    const market = createMarket('OPEN');
    market.close('Team A');
    expect(market.result).toBe('Team A');
    expect(market.status).toBe('CLOSED');
    expect(() => market.close()).toThrow('Market is already closed');
    expect(() => market.suspend()).toThrow('Market is already closed');
  });

  it('cannot suspend already suspended markets', () => {
    const market = createMarket('SUSPENDED');
    expect(() => market.suspend()).toThrow('Market is already suspended');
  });

  it('throws when updating odds on closed markets and allows changes when open', () => {
    const market = createMarket('OPEN');
    market.updateOdd('odd-1', 2.75);
    expect(market.odds.get('odd-1')?.value).toBe(2.75);
    market.close();
    expect(() => market.updateOdd('odd-1', 3)).toThrow('Cannot update odds on non-open market');
  });

  it('validates constructor inputs', () => {
    expect(() => new Market('', 'Winner', 'OPEN', new Map())).toThrow('Invalid market ID');
    expect(() => new Market('market-1', '', 'OPEN', new Map())).toThrow('Invalid market name');
    expect(() => new Market('market-1', 'Winner', 'OPEN', {} as unknown as Map<string, Odds>)).toThrow(
      'Invalid odds',
    );
  });
});

describe('Event domain behavior', () => {
  const makeMarket = () => new Market('market-1', 'Winner', 'OPEN', new Map([['odd-1', new Odds(1.5)]]));
  const createEvent = (status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CANCELED' = 'SCHEDULED') =>
    new Event('event-1', 'Championship', new Date(), status, 'Football', ['Team A', 'Team B'], new Map([['market-1', makeMarket()]]));

  it('starts and finishes an event', () => {
    const event = createEvent();
    event.start();
    expect(event.status).toBe('LIVE');
    event.finish();
    expect(event.status).toBe('FINISHED');
  });

  it('throws when canceling a finished event', () => {
    const event = createEvent('FINISHED');
    expect(() => event.cancel()).toThrow('Cannot cancel finished event');
  });

  it('allows adding markets while scheduled', () => {
    const event = createEvent('SCHEDULED');
    const extraMarket = makeMarket();
    event.addMarket(extraMarket);
    expect(event.toJSON().markets).toHaveProperty('market-1');
  });

  it('prevents invalid lifecycle transitions', () => {
    expect(() => createEvent('LIVE').start()).toThrow('Event is not scheduled');
    expect(() => createEvent('SCHEDULED').finish()).toThrow('Event is not live');
  });

  it('prevents canceling twice and adding markets when not scheduled', () => {
    const event = createEvent('SCHEDULED');
    event.cancel();
    expect(() => event.cancel()).toThrow('Event is already canceled');
    const liveEvent = createEvent('LIVE');
    expect(() => liveEvent.addMarket(makeMarket())).toThrow('Cannot add markets to non-scheduled event');
  });

  it('validates constructor inputs', () => {
    expect(
      () =>
        new Event('event-1', '', new Date(), 'SCHEDULED', 'Football', ['Team A', 'Team B'], new Map()),
    ).toThrow('Invalid event name');
    expect(
      () => new Event('event-1', 'Match', 'not-date' as unknown as Date, 'SCHEDULED', 'Football', ['Team A'], new Map()),
    ).toThrow('Invalid start date');
    expect(
      () => new Event('event-1', 'Match', new Date(), 'SCHEDULED', '', ['Team A', 'Team B'], new Map()),
    ).toThrow('Invalid category');
    expect(
      () =>
        new Event('event-1', 'Match', new Date(), 'SCHEDULED', 'Football', ['Team A'], new Map()),
    ).toThrow('Invalid participants');
    expect(
      () =>
        new Event('event-1', 'Match', new Date(), 'SCHEDULED', 'Football', ['Team A', 'Team B'], {} as unknown as Map<string, Market>),
    ).toThrow('Invalid markets');
  });

  it('serializes to JSON with nested markets', () => {
    const event = createEvent('SCHEDULED');
    const json = event.toJSON();
    expect(json.markets['market-1'].status).toBe('OPEN');
    expect(json.markets['market-1'].odds).toHaveProperty('odd-1', 1.5);
  });
});
