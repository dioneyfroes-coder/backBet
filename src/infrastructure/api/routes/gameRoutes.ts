// rota play-batch já é definida dentro da função createGameRoutes
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { protectedRoute } from '../middleware/AuthMiddleware';
import {
  createWalletRepository,
  createGameRoundRepository,
  createLedgerRepository,
} from '@/infrastructure/persistence/factory';
import { WalletService } from '@core/finance/domain/services/WalletService';
import { CoinFlipEngine } from '@core/game/domain/services/CoinFlipEngine';
import { CoinFlipGameService } from '@core/game/domain/services/CoinFlipGameService';
import { PlayCoinFlipUseCase } from '@core/game/application/use-cases/PlayCoinFlipUseCase';
import { ListAvailableGamesUseCase } from '@core/game/application/use-cases/ListAvailableGamesUseCase';
import { GetGameHistoryUseCase } from '@core/game/application/use-cases/GetGameHistoryUseCase';
import { ListRecentRoundsUseCase } from '@core/game/application/use-cases/ListRecentRoundsUseCase';
import { GameController } from '../controllers/GameController';
import { IWalletRepository } from '@core/finance/domain/repositories/IWalletRepository';
import { ILedgerRepository } from '@core/finance/domain/repositories/ILedgerRepository';
import { IGameRoundRepository } from '@core/game/domain/repositories/IGameRoundRepository';
import { GameIntegrationPort } from '@core/game/domain/ports/GameIntegrationPort';
import { createGameIntegrationAdapter } from '@/infrastructure/game/adapterFactory';
import { appConfig } from '@/shared/config/appConfig';
import { idempotencyService } from '@/shared/services/IdempotencyService';

export type GameRoutesDeps = {
  walletRepository?: IWalletRepository;
  ledgerRepository?: ILedgerRepository;
  gameRoundRepository?: IGameRoundRepository;
  integrationAdapter?: GameIntegrationPort;
};

export async function createGameRoutes(deps: GameRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const walletRepository: IWalletRepository =
    deps.walletRepository ?? (await createWalletRepository());
  const ledgerRepository: ILedgerRepository =
    deps.ledgerRepository ?? (await createLedgerRepository());
  const gameRoundRepository: IGameRoundRepository =
    deps.gameRoundRepository ?? (await createGameRoundRepository());
  const integrationAdapter: GameIntegrationPort =
    deps.integrationAdapter ?? (await createGameIntegrationAdapter());

  const walletService = new WalletService(walletRepository, ledgerRepository);
  const coinFlipConfig = appConfig.games.coinFlip;
  const coinFlipService = new CoinFlipGameService(
    walletService,
    new CoinFlipEngine(),
    gameRoundRepository,
    integrationAdapter,
    {
      enabled: coinFlipConfig.enabled,
      minBet: coinFlipConfig.minBet,
      maxBet: coinFlipConfig.maxBet,
      payoutMultiplier: coinFlipConfig.payoutMultiplier,
      fixedWinAmount: coinFlipConfig.fixedWinAmount,
    },
  );

  const gameController = new GameController(
    new PlayCoinFlipUseCase(coinFlipService, idempotencyService),
    new ListAvailableGamesUseCase(() => [
      {
        id: 'coin-flip',
        name: 'Cara ou Coroa',
        description: 'Aposte em cara ou coroa com payout fixo e instantâneo.',
        enabled: coinFlipConfig.enabled,
        minBet: coinFlipConfig.minBet,
        maxBet: coinFlipConfig.maxBet,
      },
    ]),
    new GetGameHistoryUseCase(gameRoundRepository),
    new ListRecentRoundsUseCase(gameRoundRepository),
    {
      enabled: coinFlipConfig.enabled,
      minBet: coinFlipConfig.minBet,
      maxBet: coinFlipConfig.maxBet,
      payoutMultiplier: coinFlipConfig.payoutMultiplier,
      fixedWinAmount: coinFlipConfig.fixedWinAmount,
    },
  );

  router.get(
    '/',
    asyncHandler((req, res) => gameController.listGames(req, res)),
  );

  router.get(
    '/coin-flip',
    asyncHandler((req, res) => gameController.getCoinFlipConfig(req, res)),
  );

  router.get(
    '/coin-flip/feed',
    asyncHandler((req, res) => gameController.getFeed(req, res)),
  );

  router.get(
    '/coin-flip/history',
    protectedRoute,
    asyncHandler((req, res) => gameController.getHistory(req, res)),
  );

  router.post(
    '/coin-flip/play',
    protectedRoute,
    asyncHandler((req, res) => gameController.playCoinFlip(req, res)),
  );

  return router;
}
