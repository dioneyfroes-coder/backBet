import { IEventRepository } from '@/core/betting/domain/repositories/IEventRepository';
import { Event, Market } from '@/core/betting/domain/entities/Event';
import { Odds } from '@core/odds/domain/value-objects/Odds';
import { EventStatus, MarketStatus } from '@/core/betting/types/bet.types';
import { createSampleEvents } from '@/core/betting/domain/seed/sampleEvents';
import { AppError } from '@/shared/errors/AppError';
import { EventModel, IEventDocument } from '../schemas/EventSchema';

type EventFilter = {
  status?: EventStatus;
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

type EventDoc = IEventDocument & { _id: unknown };

let seedChecked = false;
let seedingPromise: Promise<void> | null = null;

export class MongooseEventRepository implements IEventRepository {
  async create(event: Event): Promise<void> {
    try {
      const query = EventModel.findOneAndUpdate(
        { id: event.id },
        this.toDocumentData(event),
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      await query;
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao criar evento', 500, {
        originalError,
      });
    }
  }

  async update(event: Event): Promise<void> {
    try {
      const updated = await EventModel.findOneAndUpdate(
        { id: event.id },
        this.toDocumentData(event),
        { new: true },
      );
      if (!updated) {
        throw new AppError('NOT_FOUND', 'Evento não encontrado', 404, { eventId: event.id });
      }
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao atualizar evento', 500, {
        originalError,
      });
    }
  }

  async findById(id: string): Promise<Event | null> {
    try {
      await this.ensureSeededIfEmpty();
      const doc = await EventModel.findOne({ id }).lean<EventDoc | null>();
      return doc ? this.toDomain(doc) : null;
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao buscar evento', 500, {
        originalError,
      });
    }
  }

  async findByStatus(status: EventStatus): Promise<Event[]> {
    try {
      await this.ensureSeededIfEmpty();
      const docs = await EventModel.find({ status }).sort({ startDate: 1 }).lean<EventDoc[]>();
      return docs.map((doc) => this.toDomain(doc));
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao buscar eventos por status', 500, {
        originalError,
      });
    }
  }

  async findByCategory(category: string): Promise<Event[]> {
    try {
      await this.ensureSeededIfEmpty();
      const normalized = category.toLowerCase();
      const docs = await EventModel.find({}).sort({ startDate: 1 }).lean<EventDoc[]>();
      return docs
        .filter((doc) => doc.category.toLowerCase() === normalized)
        .map((doc) => this.toDomain(doc));
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao buscar eventos por categoria', 500, {
        originalError,
      });
    }
  }

  async findUpcoming(limit: number = 20): Promise<Event[]> {
    try {
      await this.ensureSeededIfEmpty();
      const now = new Date();
      const docs = await EventModel.find({
        status: 'SCHEDULED',
        startDate: { $gte: now },
      })
        .sort({ startDate: 1 })
        .limit(Math.max(0, Math.floor(limit)))
        .lean<EventDoc[]>();
      return docs.map((doc) => this.toDomain(doc));
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao buscar próximos eventos', 500, {
        originalError,
      });
    }
  }

  async findAll(filter?: EventFilter): Promise<Event[]> {
    try {
      await this.ensureSeededIfEmpty();
      const query: Record<string, unknown> = {};
      if (filter?.status) query.status = filter.status;
      if (filter?.category) query.category = filter.category;
      if (filter?.dateFrom || filter?.dateTo) {
        const range: Record<string, Date> = {};
        if (filter?.dateFrom) range.$gte = filter.dateFrom;
        if (filter?.dateTo) range.$lte = filter.dateTo;
        query.startDate = range;
      }
      const docs = await EventModel.find(query).sort({ startDate: 1 }).lean<EventDoc[]>();
      return docs.map((doc) => this.toDomain(doc));
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao listar eventos', 500, {
        originalError,
      });
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      await this.ensureSeededIfEmpty();
      return Boolean(await EventModel.exists({ id }));
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao verificar evento', 500, {
        originalError,
      });
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await EventModel.findOneAndDelete({ id });
      return !!result;
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao deletar evento', 500, {
        originalError,
      });
    }
  }

  /**
   * O catálogo de eventos do MVP nasce dos eventos de exemplo (mesmo catálogo
   * do repository in-memory). Quando a coleção está vazia (primeiro boot com
   * USE_MONGOOSE_PERSISTENCE=true), o seed acontece uma única vez para que
   * apostas/consulta funcionem igual ao modo in-memory. Upsert por id torna o
   * seed idempotente sob múltiplas instâncias.
   */
  private async ensureSeededIfEmpty(): Promise<void> {
    if (seedChecked) {
      return;
    }
    if (!seedingPromise) {
      seedingPromise = this.seedIfEmpty().catch((error) => {
        seedingPromise = null;
        throw error;
      });
    }
    await seedingPromise;
    seedChecked = true;
  }

  private async seedIfEmpty(): Promise<void> {
    try {
      const count = await EventModel.estimatedDocumentCount();
      if (count > 0) {
        return;
      }
      const samples = createSampleEvents();
      await EventModel.bulkWrite(
        samples.map((event) => ({
          updateOne: {
            filter: { id: event.id },
            update: { $setOnInsert: this.toDocumentData(event) },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('INTERNAL_SERVER_ERROR', 'Erro ao semear eventos', 500, {
        originalError,
      });
    }
  }

  private toDomain(doc: EventDoc): Event {
    return new Event(
      doc.id,
      doc.name,
      doc.startDate instanceof Date ? doc.startDate : new Date(doc.startDate),
      doc.status as EventStatus,
      doc.category,
      doc.participants ?? [],
      new Map(
        (doc.markets ?? []).map((market) => [
          market.id,
          new Market(
            market.id,
            market.name,
            market.status as MarketStatus,
            new Map(
              (market.odds ?? []).map((odd) => [
                odd.id,
                new Odds(Number(odd.value)),
              ]),
            ),
            market.result ?? undefined,
          ),
        ]),
      ),
    );
  }

  private toDocumentData(event: Event): {
    id: string;
    name: string;
    category: string;
    startDate: Date;
    status: EventStatus;
    participants: string[];
    markets: Array<{
      id: string;
      name: string;
      status: MarketStatus;
      result?: string | null;
      odds: Array<{ id: string; value: number }>;
    }>;
  } {
    return {
      id: event.id,
      name: event.name,
      category: event.category,
      startDate: event.startDate,
      status: event.status,
      participants: event.participants,
      markets: Array.from(event.markets.values()).map((market) => ({
        id: market.id,
        name: market.name,
        status: market.status,
        result: market.result,
        odds: Array.from(market.odds.entries()).map(([oddId, odd]) => ({
          id: oddId,
          value: odd.value,
        })),
      })),
    };
  }
}