import {
  CoinFlipGameService,
  CoinFlipConfig,
} from '@/core/game/domain/services/CoinFlipGameService';
import { CoinFlipEngine } from '@/core/game/domain/services/CoinFlipEngine';
import { InMemoryGameRoundRepository } from '@/core/game/domain/repositories/InMemoryGameRoundRepository';
import { IWalletService } from '@/core/finance/domain/services/IWalletService';
import { GameIntegrationPort } from '@/core/game/domain/ports/GameIntegrationPort';
import { DomainError } from '@/core/shared/domain/errors/DomainError';

const baseConfig: CoinFlipConfig = {
  enabled: true,
  minBet: 5,
  maxBet: 500,
  payoutMultiplier: 2,
};

const createService = (
  overridesConfig: Partial<CoinFlipConfig> = {},
  engine: CoinFlipEngine = new CoinFlipEngine(() => 0.1),
  walletSvc?: jest.Mocked<IWalletService>,
  integration?: jest.Mocked<GameIntegrationPort>,
) => {
  const walletService: jest.Mocked<IWalletService> =
    walletSvc ??
    ({
      withdraw: jest.fn().mockResolvedValue({ currency: 'BRL' }),
      deposit: jest.fn().mockResolvedValue({ currency: 'BRL' }),
      lock: jest.fn().mockResolvedValue({ currency: 'BRL' }),
      withdrawLocked: jest.fn().mockResolvedValue({ currency: 'BRL' }),
      findByUserId: jest.fn().mockResolvedValue({ balance: 100, currency: 'BRL' }),
    } as any);

  const integrationPort: jest.Mocked<GameIntegrationPort> =
    integration ??
    ({
      notifyRound: jest.fn().mockResolvedValue(undefined),
      broadcastFeed: jest.fn().mockResolvedValue(undefined),
    } as any);

  const repository = new InMemoryGameRoundRepository();
  const service = new CoinFlipGameService(walletService, engine, repository, integrationPort, {
    ...baseConfig,
    ...overridesConfig,
  });

  return { service, walletService, repository, integrationPort };
};

describe('CoinFlipGameService', () => {
  it('should lock, withdrawLocked, credit winnings and persist round on victory', async () => {
    const { service, walletService, repository, integrationPort } = createService();

    const round = await service.play({ userId: 'user-1', choice: 'HEADS', wager: 10 });

    expect(walletService.lock).toHaveBeenCalledWith(
      'user-1',
      10,
      expect.objectContaining({ type: 'STAKE_LOCK', source: 'GAME' }),
    );
    expect(walletService.withdrawLocked).toHaveBeenCalledWith(
      'user-1',
      10,
      expect.objectContaining({ type: 'STAKE_RELEASE', source: 'GAME' }),
    );
    expect(walletService.deposit).toHaveBeenCalledWith(
      'user-1',
      30,
      expect.objectContaining({ type: 'GAME_WIN', source: 'GAME' }),
    ); // wager + payout (10 + 20)
    const stored = await repository.findByUser('user-1', 1);
    expect(stored[0]?.id).toBe(round.id);
    expect(integrationPort.notifyRound).toHaveBeenCalledWith(round);
    expect(integrationPort.broadcastFeed).toHaveBeenCalledWith(stored);
  });

  it('should lock, withdrawLocked and not credit winnings when player loses', async () => {
    const engine = new CoinFlipEngine(() => 0.9); // outcome tails
    const walletService = {
      lock: jest.fn().mockResolvedValue({ currency: 'USD' }),
      withdrawLocked: jest.fn().mockResolvedValue({ currency: 'USD' }),
      deposit: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue({ balance: 100, currency: 'USD' }),
    } as Partial<IWalletService> as jest.Mocked<IWalletService>;
    const { service, integrationPort } = createService({}, engine, walletService);

    const round = await service.play({ userId: 'user-2', choice: 'HEADS', wager: 25 });

    expect(walletService.lock).toHaveBeenCalledWith(
      'user-2',
      25,
      expect.objectContaining({ type: 'STAKE_LOCK', source: 'GAME' }),
    );
    expect(walletService.withdrawLocked).toHaveBeenCalledWith(
      'user-2',
      25,
      expect.objectContaining({ type: 'STAKE_RELEASE', source: 'GAME' }),
    );
    expect(walletService.deposit).not.toHaveBeenCalled();
    expect(round.result).toBe('LOSE');
    expect(round.payoutAmount).toBe(0);
    expect(integrationPort.notifyRound).toHaveBeenCalledTimes(1);
  });

  it('should respect fixed win amount when configured', async () => {
    const { service, walletService } = createService({ fixedWinAmount: 42 });

    await service.play({ userId: 'user-3', choice: 'HEADS', wager: 10 });

    expect(walletService.deposit).toHaveBeenCalledWith(
      'user-3',
      52,
      expect.objectContaining({ type: 'GAME_WIN', source: 'GAME' }),
    );
  });

  it('should throw when game is disabled', async () => {
    const { service } = createService({ enabled: false });
    await expect(service.play({ userId: 'user', choice: 'HEADS', wager: 10 })).rejects.toThrow(
      DomainError,
    );
  });

  it.each([
    ['wager <= 0', 0],
    ['wager below min', 1],
    ['wager above max', 1000],
  ])('should enforce bet limits: %s', async (_label, wager) => {
    const { service } = createService();
    await expect(service.play({ userId: 'user', choice: 'HEADS', wager })).rejects.toThrow(
      DomainError,
    );
  });
});
