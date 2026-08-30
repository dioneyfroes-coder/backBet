import { Event, Market } from '../entities/Event';
import { Odds } from '@core/odds/domain/value-objects/Odds';
import { EventStatus, MarketStatus } from '../../types/bet.types';

type MarketSeed = {
  id: string;
  name: string;
  status: MarketStatus;
  odds: Array<{ id: string; value: number }>;
};

type EventSeed = {
  id: string;
  name: string;
  startInMinutes: number;
  status: EventStatus;
  category: string;
  participants: string[];
  markets: MarketSeed[];
};

const EVENT_SEEDS: EventSeed[] = [
  {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    name: 'FC Tech vs Dev United',
    startInMinutes: 90,
    status: 'SCHEDULED',
    category: 'Football',
    participants: ['FC Tech', 'Dev United'],
    markets: [
      {
        id: 'mkt-1x2',
        name: 'Resultado Final',
        status: 'OPEN',
        odds: [
          { id: 'home', value: 1.9 },
          { id: 'draw', value: 3.1 },
          { id: 'away', value: 3.6 },
        ],
      },
    ],
  },
  {
    id: 'a1b2c3d4-0000-4111-8222-333344445555',
    name: 'Data Lakers vs AI Warriors',
    startInMinutes: 240,
    status: 'SCHEDULED',
    category: 'Basketball',
    participants: ['Data Lakers', 'AI Warriors'],
    markets: [
      {
        id: 'mkt-winner',
        name: 'Vencedor',
        status: 'OPEN',
        odds: [
          { id: 'lakers', value: 1.8 },
          { id: 'warriors', value: 2.0 },
        ],
      },
    ],
  },
  {
    id: 'f6e5d4c3-0000-4222-8333-444455556666',
    name: 'Open Code Finals',
    startInMinutes: -60,
    status: 'LIVE',
    category: 'Tennis',
    participants: ['Ada Lovelace', 'Grace Hopper'],
    markets: [
      {
        id: 'mkt-match',
        name: 'Vencedor da Partida',
        status: 'OPEN',
        odds: [
          { id: 'ada', value: 1.7 },
          { id: 'grace', value: 2.2 },
        ],
      },
    ],
  },
];

const buildMarkets = (seeds: MarketSeed[]): Map<string, Market> =>
  new Map(
    seeds.map((market) => [
      market.id,
      new Market(
        market.id,
        market.name,
        market.status,
        new Map(market.odds.map((odd) => [odd.id, new Odds(odd.value)])),
      ),
    ]),
  );

export function createSampleEvents(now: number = Date.now()): Event[] {
  return EVENT_SEEDS.map(
    (seed) =>
      new Event(
        seed.id,
        seed.name,
        new Date(now + seed.startInMinutes * 60 * 1000),
        seed.status,
        seed.category,
        seed.participants,
        buildMarkets(seed.markets),
      ),
  );
}