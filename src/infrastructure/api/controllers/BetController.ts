import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { AuthenticatedRequest, getRequestUserId } from '../middleware/AuthMiddleware';
import { PlaceBetDTO, CancelBetDTO, PlaceBetDTOType, CancelBetDTOType } from '../dtos/BetDTOs';
import { BetService } from '@core/betting/domain/services/BetService';
import { PlaceBetUseCase } from '@core/betting/application/use-cases/PlaceBetUseCase';
import { CancelBetUseCase } from '@core/betting/application/use-cases/CancelBetUseCase';
import { GetUserBetsUseCase } from '@core/betting/application/use-cases/GetUserBetsUseCase';
import { GetEventBetsUseCase } from '@core/betting/application/use-cases/GetEventUseCase';
import { flushEventOddsCache } from '@/infrastructure/cache/cacheHooks';
import { ICreateBetDTO } from '@/core/betting/types/bet.types';
import { parsePagination, paginate } from '../utils/pagination';

/**
 * Controller de apostas
 * Endpoints documentados com @openapi
 */
export class BetController extends BaseController {
  constructor(
    private placeBetUseCase: PlaceBetUseCase,
    private cancelBetUseCase: CancelBetUseCase,
    private getUserBetsUseCase: GetUserBetsUseCase,
    private getEventBetsUseCase: GetEventBetsUseCase,
  ) {
    super();
  }

  /**
   * @openapi
   * /api/v1/bets/event/{eventId}:
   *   get:
   *     tags:
   *       - Bets
   *     summary: Lista apostas de um evento
   *     parameters:
   *       - in: path
   *         name: eventId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       '200':
   *         description: Lista de apostas do evento
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BetListResponse'
   */
  async getEventBets(req: Request, res: Response): Promise<Response> {
    const { eventId } = req.params;
    if (!eventId) return this.badRequest(res, 'eventId é obrigatório');

    const bets = await this.getEventBetsUseCase.execute(eventId);
    const { items, pagination } = paginate(bets, parsePagination(req.query));
    return this.ok(res, { bets: items.map((b) => b.toJSON()), pagination });
  }

  /**
   * @openapi
   * /api/v1/bets:
   *   post:
   *     tags:
   *       - Bets
   *     security:
   *       - bearerAuth: []
   *     summary: Coloca uma nova aposta
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/PlaceBetRequest'
   *     responses:
   *       '201':
   *         description: Aposta criada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BetResponse'
   *       '400':
   *         description: Dados inválidos
   */
  async placeBet(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);
    if (!userId) return this.unauthorized(res, 'Autenticação requerida');

    const payload = this.validateSchema(PlaceBetDTO, req.body) as PlaceBetDTOType;

    const input: ICreateBetDTO = {
      userId,
      eventId: payload.eventId,
      marketId: payload.marketId,
      oddId: payload.oddId,
      amount: payload.amount,
      type: payload.type === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE',
    };
    const idempotencyKey = this.getIdempotencyKey(req);
    const { bet, replayed } = await this.placeBetUseCase.execute(input, idempotencyKey);
    if (replayed) res.set('Idempotency-Replayed', 'true');
    await flushEventOddsCache(payload.eventId).catch((error) =>
      console.warn('Failed to flush event cache', error),
    );
    return this.created(res, bet.toJSON());
  }

  /**
   * @openapi
   * /api/v1/bets/{betId}/cancel:
   *   post:
   *     tags:
   *       - Bets
   *     security:
   *       - bearerAuth: []
   *     summary: Cancela uma aposta pendente
   *     parameters:
   *       - in: path
   *         name: betId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CancelBetRequest'
   *     responses:
   *       '200':
   *         description: Aposta cancelada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BetResponse'
   *       '400':
   *         description: Não pode cancelar
   */
  async cancelBet(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);
    if (!userId) return this.unauthorized(res, 'Autenticação requerida');

    const payload = this.validateSchema(CancelBetDTO, {
      betId: req.params.betId,
      ...(req.body || {}),
    }) as CancelBetDTOType;
    const idempotencyKey = this.getIdempotencyKey(req);
    const { bet, replayed } = await this.cancelBetUseCase.execute(
      {
        betId: payload.betId,
        reason: payload.reason ?? '',
        canceledBy: userId,
      },
      idempotencyKey,
    );
    if (replayed) res.set('Idempotency-Replayed', 'true');
    await flushEventOddsCache(bet.eventId).catch((error) =>
      console.warn('Failed to flush event cache', error),
    );
    return this.ok(res, bet.toJSON());
  }

  /**
   * @openapi
   * /api/v1/bets/me:
   *   get:
   *     tags:
   *       - Bets
   *     security:
   *       - bearerAuth: []
   *     summary: Lista apostas do usuário autenticado
   *     responses:
   *       '200':
   *         description: Lista de apostas do usuário
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BetListResponse'
   */
  async getMyBets(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);
    if (!userId) return this.unauthorized(res, 'Autenticação requerida');

    const bets = await this.getUserBetsUseCase.execute(userId);
    const { items, pagination } = paginate(bets, parsePagination(req.query));
    return this.ok(res, { bets: items.map((b) => b.toJSON()), pagination });
  }

  private getIdempotencyKey(req: Request): string | undefined {
    if (typeof req.get === 'function') {
      return req.get('Idempotency-Key') ?? undefined;
    }
    const header = req.headers?.['idempotency-key'];
    return Array.isArray(header) ? header[0] : (header as string | undefined);
  }
}
