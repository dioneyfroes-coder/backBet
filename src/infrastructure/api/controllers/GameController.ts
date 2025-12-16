import { PlayCoinFlipBatchDTO, PlayCoinFlipBatchDTOType } from '../dtos/GameDTOs';

// Mantém apenas UMA declaração da classe GameController, com todos os métodos (playCoinFlipBatch, listGames, getCoinFlipConfig, playCoinFlip, getHistory, getFeed) definidos dentro dela.
// Remover qualquer duplicidade de export class GameController e garantir que todos os métodos estejam presentes.
import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { PlayCoinFlipUseCase } from '@core/game/aplication/use-cases/PlayCoinFlipUseCase';
import { ListAvailableGamesUseCase } from '@core/game/aplication/use-cases/ListAvailableGamesUseCase';
import { GetGameHistoryUseCase } from '@core/game/aplication/use-cases/GetGameHistoryUseCase';
import { ListRecentRoundsUseCase } from '@core/game/aplication/use-cases/ListRecentRoundsUseCase';
import { AuthenticatedRequest, getRequestUserId } from '../middleware/AuthMiddleware';
import { PlayCoinFlipDTO, PlayCoinFlipDTOType, ListHistoryQueryDTO } from '../dtos/GameDTOs';
import { CoinFlipConfig } from '@core/game/domain/services/CoinFlipGameService';

export class GameController extends BaseController {
  constructor(
    private readonly playCoinFlipUseCase: PlayCoinFlipUseCase,
    private readonly listGamesUseCase: ListAvailableGamesUseCase,
    private readonly getHistoryUseCase: GetGameHistoryUseCase,
    private readonly listRecentRoundsUseCase: ListRecentRoundsUseCase,
    private readonly coinFlipConfig: CoinFlipConfig,
  ) {
    super();
  }

  async listGames(_req: Request, res: Response): Promise<Response> {
    /**
     * @openapi
     * /api/games:
     *   get:
     *     tags:
     *       - Games
     *     summary: Lista jogos disponíveis
     *     responses:
     *       '200':
     *         description: Metadados dos jogos
     */
    const games = this.listGamesUseCase.execute();
    return this.ok(res, { games });
  }

  async getCoinFlipConfig(_req: Request, res: Response): Promise<Response> {
    /**
     * @openapi
     * /api/games/coin-flip:
     *   get:
     *     tags:
     *       - Games
     *     summary: Detalhes do jogo de cara ou coroa
     *     responses:
     *       '200':
     *         description: Configuração atual do jogo
     */
    return this.ok(res, {
      gameId: 'coin-flip',
      config: {
        enabled: this.coinFlipConfig.enabled !== false,
        minBet: this.coinFlipConfig.minBet,
        maxBet: this.coinFlipConfig.maxBet,
        payoutMultiplier: this.coinFlipConfig.payoutMultiplier,
        fixedWinAmount: this.coinFlipConfig.fixedWinAmount ?? null,
      },
    });
  }

  async playCoinFlip(req: AuthenticatedRequest, res: Response): Promise<Response> {
    /**
     * @openapi
     * /api/games/coin-flip/play:
     *   post:
     *     tags:
     *       - Games
     *     security:
     *       - bearerAuth: []
     *     summary: Executa uma rodada de cara ou coroa
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               choice:
     *                 type: string
     *                 enum: [HEADS, TAILS]
     *               wager:
     *                 type: number
     *                 minimum: 1
     *     responses:
     *       '200':
     *         description: Resultado da rodada
     */
    const userId = getRequestUserId(req);
    if (!userId) {
      return this.unauthorized(res);
    }
    if (this.coinFlipConfig.enabled === false) {
      return this.error(res, 'GAME_DISABLED', 'Cara ou coroa está indisponível no momento', 503);
    }

    const payload = this.validateSchema(PlayCoinFlipDTO, req.body) as PlayCoinFlipDTOType;
    // Ignora o valor enviado pelo usuário e usa o valor fixo da configuração
    const round = await this.playCoinFlipUseCase.execute({
      userId,
      choice: payload.choice,
      wager: this.coinFlipConfig.minBet,
    });
    return this.ok(res, round.toJSON());
  }

  async playCoinFlipBatch(req: AuthenticatedRequest, res: Response): Promise<Response> {
    /**
     * @openapi
     * /api/games/coin-flip/play-batch:
     *   post:
     *     tags:
     *       - Games
     *     security:
     *       - bearerAuth: []
     *     summary: Executa várias rodadas de cara ou coroa em sequência
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               choices:
     *                 type: array
     *                 items:
     *                   type: string
     *                   enum: [HEADS, TAILS]
     *     responses:
     *       '200':
     *         description: Resultados das rodadas e saldo final
     */
    const userId = getRequestUserId(req);
    if (!userId) {
      return this.unauthorized(res);
    }
    if (this.coinFlipConfig.enabled === false) {
      return this.error(res, 'GAME_DISABLED', 'Cara ou coroa está indisponível no momento', 503);
    }

    const payload = this.validateSchema(PlayCoinFlipBatchDTO, req.body) as PlayCoinFlipBatchDTOType;
    const wager = this.coinFlipConfig.minBet;
    const rounds = [];
    let totalPrize = 0;
    for (const choice of payload.choices) {
      const round = await this.playCoinFlipUseCase.execute({ userId, choice, wager });
      rounds.push(round.toJSON());
      totalPrize += round.payoutAmount - wager;
    }
    return this.ok(res, { rounds, totalPrize });
  }

  async getHistory(req: AuthenticatedRequest, res: Response): Promise<Response> {
    /**
     * @openapi
     * /api/games/coin-flip/history:
     *   get:
     *     tags:
     *       - Games
     *     security:
     *       - bearerAuth: []
     *     summary: Histórico de cara ou coroa do usuário
     *     parameters:
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *           minimum: 1
     *           maximum: 50
     *     responses:
     *       '200':
     *         description: Histórico recente
     */
    const userId = getRequestUserId(req);
    if (!userId) {
      return this.unauthorized(res);
    }
    const query = this.validateSchema(ListHistoryQueryDTO, req.query) ?? {};
    const rounds = await this.getHistoryUseCase.execute(userId, query.limit ?? 20);
    return this.ok(res, {
      rounds: rounds.map((round) => round.toJSON()),
    });
  }

  async getFeed(_req: Request, res: Response): Promise<Response> {
    /**
     * @openapi
     * /api/games/coin-flip/feed:
     *   get:
     *     tags:
     *       - Games
     *     summary: Feed público das últimas rodadas de cara ou coroa
     *     responses:
     *       '200':
     *         description: Feed de rodadas
     */
    const rounds = await this.listRecentRoundsUseCase.execute(20);
    return this.ok(res, {
      rounds: rounds.map((round) => round.toJSON()),
    });
  }
}
