import express from 'express';
import request from 'supertest';
import { createGameRoutes } from '@/infrastructure/api/routes/gameRoutes';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { InMemoryGameRoundRepository } from '@/core/game/domain/repositories/InMemoryGameRoundRepository';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { GameRound } from '@/core/game/domain/entities/GameRound';
import { GameIntegrationPort } from '@/core/game/domain/ports/GameIntegrationPort';
import { JwtService } from '@/shared/services/JwtService';
import { appConfig } from '@/shared/config/appConfig';

describe('Game Routes', () => {
  const jwtService = new JwtService();
  const userId = 'user-e2e';
  let app: express.Express;
  let walletRepository: WalletRepository;
  let roundRepository: InMemoryGameRoundRepository;
  let integrationAdapter: jest.Mocked<GameIntegrationPort>;
  let accessToken: string;

  beforeEach(async () => {
    appConfig.games.coinFlip.enabled = true;
    appConfig.games.coinFlip.minBet = 5;
    appConfig.games.coinFlip.maxBet = 500;
    appConfig.games.coinFlip.payoutMultiplier = 2;
    appConfig.games.coinFlip.fixedWinAmount = undefined;

    walletRepository = new WalletRepository();
    const wallet = new Wallet(userId, 'BRL');
    wallet.deposit(200);
    await walletRepository.save(wallet);

    roundRepository = new InMemoryGameRoundRepository();
    integrationAdapter = {
      notifyRound: jest.fn().mockResolvedValue(undefined),
      broadcastFeed: jest.fn().mockResolvedValue(undefined),
    } as any;

    const routes = await createGameRoutes({
      walletRepository,
      gameRoundRepository: roundRepository,
      integrationAdapter,
    });

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
          const payload = jwtService.verifyAccessToken(token);
          (req as any).authContext = {
            userId: payload.userId,
            sessionId: payload.sessionId,
          };
        } catch (error) {
          console.warn('Invalid token in tests', error);
        }
      }
      next();
    });
    app.use('/api/games', routes);

    accessToken = jwtService.signAccessToken(userId, 'session-test');
  });

  it('should list available games', async () => {
    const response = await request(app).get('/api/games');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.games[0].id).toBe('coin-flip');
  });

  it('should expose current coin flip configuration', async () => {
    const response = await request(app).get('/api/games/coin-flip');

    expect(response.status).toBe(200);
    expect(response.body.data.config.enabled).toBe(true);
    expect(response.body.data.config.minBet).toBe(5);
  });

  it('should reject history without authentication', async () => {
    const response = await request(app).get('/api/games/coin-flip/history');

    expect(response.status).toBe(401);
  });

  it('should play a round and allow fetching history with auth', async () => {
    const playResponse = await request(app)
      .post('/api/games/coin-flip/play')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ choice: 'HEADS', wager: 20 });

    expect(playResponse.status).toBe(200);
    expect(playResponse.body.data.result).toBeDefined();
    expect(integrationAdapter.notifyRound).toHaveBeenCalledTimes(1);

    const historyResponse = await request(app)
      .get('/api/games/coin-flip/history?limit=5')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.data.rounds).toHaveLength(1);
  });

  it('should provide a public feed', async () => {
    await roundRepository.create(
      new GameRound('feed-1', userId, 'COIN_FLIP', 10, 'BRL', 'HEADS', 'TAILS', 'LOSE', 0),
    );

    const response = await request(app).get('/api/games/coin-flip/feed');

    expect(response.status).toBe(200);
    expect(response.body.data.rounds.length).toBeGreaterThanOrEqual(1);
  });
});
