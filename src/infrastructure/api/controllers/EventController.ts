import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ListEventsUseCase } from '@core/betting/aplication/use-cases/ListEventsUseCase';
import { GetEventDetailsUseCase } from '@core/betting/aplication/use-cases/GetEventDetailsUseCase';
import { GetUpcomingEventsUseCase } from '@core/betting/aplication/use-cases/GetUpcomingEventsUseCase';
import { ListEventCategoriesUseCase } from '@core/betting/aplication/use-cases/ListEventCategoriesUseCase';
import { ListEventsQueryDTO, ListEventsQueryDTOType } from '../dtos/EventDTOs';
import { Event } from '@core/betting/domain/entities/Event';

export class EventController extends BaseController {
  constructor(
    private readonly listEventsUseCase: ListEventsUseCase,
    private readonly getEventDetailsUseCase: GetEventDetailsUseCase,
    private readonly getUpcomingEventsUseCase: GetUpcomingEventsUseCase,
    private readonly listEventCategoriesUseCase: ListEventCategoriesUseCase,
  ) {
    super();
  }

  private serializeEvent(event: Event) {
    return event.toJSON();
  }

  /**
   * @openapi
   * /api/events:
   *   get:
   *     tags:
   *       - Events
   *     summary: Lista eventos com filtros opcionais
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [SCHEDULED, LIVE, FINISHED, CANCELED]
   *       - in: query
   *         name: category
   *         schema:
   *           type: string
   *       - in: query
   *         name: dateFrom
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: dateTo
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Catálogo de eventos
   */
  async listEvents(req: Request, res: Response) {
    try {
      const query = (this.validateSchema(ListEventsQueryDTO, req.query) ??
        {}) as ListEventsQueryDTOType;
      const events = await this.listEventsUseCase.execute({
        status: query.status,
        category: query.category,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        limit: query.limit,
        search: query.search,
      });
      return this.ok(res, { events: events.map((event) => this.serializeEvent(event)) });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/events/upcoming:
   *   get:
   *     tags:
   *       - Events
   *     summary: Lista próximos eventos
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *     responses:
   *       '200':
   *         description: Próximos eventos
   */
  async listUpcoming(req: Request, res: Response) {
    try {
      const query = (this.validateSchema(ListEventsQueryDTO, req.query) ??
        {}) as ListEventsQueryDTOType;
      const events = await this.getUpcomingEventsUseCase.execute(query.limit);
      return this.ok(res, { events: events.map((event) => this.serializeEvent(event)) });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/events/{eventId}:
   *   get:
   *     tags:
   *       - Events
   *     summary: Detalhes de um evento
   *     parameters:
   *       - in: path
   *         name: eventId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Detalhes do evento
   *       '404':
   *         description: Evento não encontrado
   */
  async getEventDetails(req: Request, res: Response) {
    try {
      const event = await this.getEventDetailsUseCase.execute(req.params.eventId);
      return this.ok(res, this.serializeEvent(event));
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/events/{eventId}/markets:
   *   get:
   *     tags:
   *       - Events
   *     summary: Lista mercados de um evento
   *     parameters:
   *       - in: path
   *         name: eventId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Mercados do evento
   */
  async getEventMarkets(req: Request, res: Response) {
    try {
      const event = await this.getEventDetailsUseCase.execute(req.params.eventId);
      const markets = Array.from(event.markets.values()).map((market) => market.toJSON());
      return this.ok(res, { eventId: event.id, markets });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/events/categories:
   *   get:
   *     tags:
   *       - Events
   *     summary: Lista categorias disponíveis
   *     responses:
   *       '200':
   *         description: Categorias cadastradas
   */
  async listCategories(_req: Request, res: Response) {
    try {
      const categories = await this.listEventCategoriesUseCase.execute();
      return this.ok(res, { categories });
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}
