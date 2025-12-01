import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { EventController } from '../controllers/EventController';
import { createEventRepository } from '@/infrastructure/persistence/factory';
import { EventCatalogService } from '@core/betting/domain/services/EventCatalogService';
import { ListEventsUseCase } from '@core/betting/aplication/use-cases/ListEventsUseCase';
import { GetEventDetailsUseCase } from '@core/betting/aplication/use-cases/GetEventDetailsUseCase';
import { GetUpcomingEventsUseCase } from '@core/betting/aplication/use-cases/GetUpcomingEventsUseCase';
import { ListEventCategoriesUseCase } from '@core/betting/aplication/use-cases/ListEventCategoriesUseCase';
import { IEventRepository } from '@core/betting/domain/repositories/IEventRepository';

export type EventRoutesDeps = {
  eventRepository?: IEventRepository;
};

export async function createEventRoutes(deps: EventRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const eventRepository: IEventRepository = deps.eventRepository ?? (await createEventRepository());
  const catalogService = new EventCatalogService(eventRepository);

  const eventController = new EventController(
    new ListEventsUseCase(catalogService),
    new GetEventDetailsUseCase(catalogService),
    new GetUpcomingEventsUseCase(catalogService),
    new ListEventCategoriesUseCase(catalogService),
  );

  router.get(
    '/',
    asyncHandler((req, res) => eventController.listEvents(req, res)),
  );

  router.get(
    '/upcoming',
    asyncHandler((req, res) => eventController.listUpcoming(req, res)),
  );

  router.get(
    '/categories',
    asyncHandler((req, res) => eventController.listCategories(req, res)),
  );

  router.get(
    '/:eventId',
    asyncHandler((req, res) => eventController.getEventDetails(req, res)),
  );

  router.get(
    '/:eventId/markets',
    asyncHandler((req, res) => eventController.getEventMarkets(req, res)),
  );

  return router;
}
