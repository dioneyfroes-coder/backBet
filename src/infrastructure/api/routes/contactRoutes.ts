import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { CreateContactMessage } from '@/core/contact/application/use-cases/CreateContactMessage';
import { ContactController } from '@/infrastructure/api/controllers/ContactController';
import { asyncHandler } from '@/infrastructure/api/middleware/asyncHandler';

export type ContactRoutesDeps = {};

export async function createContactRoutes(_deps: ContactRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const createContactUseCase = new CreateContactMessage();
  const contactController = new ContactController(createContactUseCase);

  // Rate limit: 10 requests per hour per IP
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ success: false, error: { message: 'Too Many Requests' } }),
  });

  router.post('/', limiter, asyncHandler((req, res) => contactController.create(req, res)));

  return router;
}
