// src/core/betting/infra/repositories/EventRepository.ts
import { IEventRepository } from '../../domain/repositories/IEventRepository';
import { Event, Market } from '../../domain/entities/Event';
import { EventStatus, MarketStatus } from '../../types/bet.types';
import { Odds } from '@core/odds/domain/value-objects/Odds';

type EventFilter = {
  status?: EventStatus;
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export class EventRepository implements IEventRepository {
  private events: Event[] = [];

  constructor() {
    this.seedSampleEvents();
  }

  async create(event: Event): Promise<void> {
    this.events.push(event);
  }

  async update(event: Event): Promise<void> {
    const index = this.events.findIndex((e) => e.id === event.id);
    if (index >= 0) {
      this.events[index] = event;
      return;
    }
    this.events.push(event);
  }

  async findById(id: string): Promise<Event | null> {
    return this.events.find((e) => e.id === id) || null;
  }

  async findByStatus(status: EventStatus): Promise<Event[]> {
    return this.events.filter((event) => event.status === status);
  }

  async findByCategory(category: string): Promise<Event[]> {
    const normalized = category.toLowerCase();
    return this.events.filter((event) => event.category.toLowerCase() === normalized);
  }

  async findUpcoming(limit: number = 20): Promise<Event[]> {
    const now = Date.now();
    return this.events
      .filter((event) => event.status === 'SCHEDULED' && event.startDate.getTime() >= now)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .slice(0, limit);
  }

  async findAll(filter?: EventFilter): Promise<Event[]> {
    const normalizedCategory = filter?.category?.toLowerCase();
    return this.events
      .filter((event) => {
        if (filter?.status && event.status !== filter.status) {
          return false;
        }
        if (normalizedCategory && event.category.toLowerCase() !== normalizedCategory) {
          return false;
        }
        if (filter?.dateFrom && event.startDate < filter.dateFrom) {
          return false;
        }
        if (filter?.dateTo && event.startDate > filter.dateTo) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }

  async exists(id: string): Promise<boolean> {
    return this.events.some((event) => event.id === id);
  }

  async delete(id: string): Promise<boolean> {
    const initialLength = this.events.length;
    this.events = this.events.filter((e) => e.id !== id);
    return this.events.length < initialLength;
  }

  private seedSampleEvents(): void {
    if (this.events.length > 0) {
      return;
    }

    const now = Date.now();
    const buildMarkets = (seed: Array<{ id: string; name: string; status: MarketStatus; odds: Array<{ id: string; value: number }> }>) => {
      return new Map(
        seed.map((market) => [
          market.id,
          new Market(
            market.id,
            market.name,
            market.status,
            new Map(market.odds.map((odd) => [odd.id, new Odds(odd.value)])),
          ),
        ]),
      );
    };

    const seeds: Array<{
      id: string;
      name: string;
      startInMinutes: number;
      status: EventStatus;
      category: string;
      participants: string[];
      markets: Array<{ id: string; name: string; status: MarketStatus; odds: Array<{ id: string; value: number }> }>;
    }> = [
      {
        id: 'evt-football-001',
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
        id: 'evt-basket-002',
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
        id: 'evt-tennis-003',
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

    this.events = seeds.map(
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
}
