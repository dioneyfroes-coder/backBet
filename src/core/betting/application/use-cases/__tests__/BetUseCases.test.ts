import { CancelBetUseCase } from '../CancelBetUseCase';
import { GetEventBetsUseCase } from '../GetEventUseCase';
import { GetUserBetsUseCase } from '../GetUserBetsUseCase';
import { ResolveBetUseCase } from '../ResolveBetUseCase';
import { BetService } from '../../../domain/services/BetService';
import { Bet } from '../../../domain/entities/Bet';
import { ICancelBetDTO, IResolveBetDTO } from '../../../types/bet.types';
import { executeWithBetErrorMapping } from '../../errors/BetErrorMapper';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@core/odds/domain/value-objects/Odds';
import { IdempotencyService, InMemoryIdempotencyStore } from '@/shared/services/IdempotencyService';

jest.mock('../../errors/BetErrorMapper', () => ({
  executeWithBetErrorMapping: jest.fn(),
}));

const executeWithBetErrorMappingMock = executeWithBetErrorMapping as jest.MockedFunction<
  typeof executeWithBetErrorMapping
>;

const idem = () => new IdempotencyService(new InMemoryIdempotencyStore());

const makeBet = (id = 'bet-1', status: Bet['status'] = 'PENDING'): Bet =>
  new Bet(
    id,
    'user-1',
    'event-1',
    'market-a',
    new Money(100, 'BRL'),
    new Odds(2),
    status,
    'SINGLE',
    new Date(),
    undefined,
    undefined,
  );

describe('Bet application use cases', () => {
  let betService: jest.Mocked<BetService>;
  const mockBet = { id: 'bet-123' } as Bet;

  beforeEach(() => {
    betService = {
      cancelBet: jest.fn().mockResolvedValue(mockBet),
      getEventBets: jest.fn().mockResolvedValue([mockBet]),
      getUserBets: jest.fn().mockResolvedValue([mockBet]),
      placeBet: jest.fn().mockResolvedValue(mockBet),
      resolveBet: jest.fn().mockResolvedValue(mockBet),
    } as unknown as jest.Mocked<BetService>;

    executeWithBetErrorMappingMock.mockImplementation(async (operation) => operation());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CancelBetUseCase', () => {
    it('delegates cancellation through the bet service', async () => {
      const input: ICancelBetDTO = { betId: 'bet-1', reason: 'user-request', canceledBy: 'user-1' };
      const useCase = new CancelBetUseCase(betService);

      const result = await useCase.execute(input);

      expect(executeWithBetErrorMappingMock).toHaveBeenCalledTimes(1);
      expect(betService.cancelBet).toHaveBeenCalledWith(input);
      expect(result).toBe(mockBet);
    });

    it('propagates mapped errors without calling the service', async () => {
      const input: ICancelBetDTO = { betId: 'bet-1', reason: 'user-request', canceledBy: 'user-1' };
      const useCase = new CancelBetUseCase(betService);
      const expectedError = new Error('mapped-error');

      executeWithBetErrorMappingMock.mockRejectedValueOnce(expectedError);

      await expect(useCase.execute(input)).rejects.toThrow(expectedError);
      expect(betService.cancelBet).not.toHaveBeenCalled();
    });
  });

  describe('GetEventBetsUseCase', () => {
    it('retrieves bets for the given event', async () => {
      const useCase = new GetEventBetsUseCase(betService);
      const eventId = 'event-1';

      const result = await useCase.execute(eventId);

      expect(executeWithBetErrorMappingMock).toHaveBeenCalledTimes(1);
      expect(betService.getEventBets).toHaveBeenCalledWith(eventId);
      expect(result).toEqual([mockBet]);
    });
  });

  describe('GetUserBetsUseCase', () => {
    it('returns bets for the requested user', async () => {
      const useCase = new GetUserBetsUseCase(betService);
      const userId = 'user-1';

      const result = await useCase.execute(userId);

      expect(executeWithBetErrorMappingMock).toHaveBeenCalledTimes(1);
      expect(betService.getUserBets).toHaveBeenCalledWith(userId);
      expect(result).toEqual([mockBet]);
    });
  });

  describe('ResolveBetUseCase', () => {
    it('resolves bets using the bet service', async () => {
      const input: IResolveBetDTO = { betId: 'bet-1', result: 'WON', marketResult: 'team-a' };
      const useCase = new ResolveBetUseCase(betService);

      const result = await useCase.execute(input);

      expect(executeWithBetErrorMappingMock).toHaveBeenCalledTimes(1);
      expect(betService.resolveBet).toHaveBeenCalledWith(input);
      expect(result).toBe(mockBet);
    });
  });

  describe('idempotency on cancel/settlement', () => {
    it('cancelBet replays the same result on a repeated key without running the service twice', async () => {
      const canceled = makeBet('bet-1', 'CANCELED');
      betService.cancelBet = jest.fn().mockResolvedValue(canceled);
      const useCase = new CancelBetUseCase(betService, idem());
      const input: ICancelBetDTO = { betId: 'bet-1', reason: 'r', canceledBy: 'user-1' };

      const first = await useCase.execute(input, 'req-cancel-1');
      const replay = await useCase.execute(input, 'req-cancel-1');

      expect(first.status).toBe('CANCELED');
      expect(replay.status).toBe('CANCELED');
      expect(betService.cancelBet).toHaveBeenCalledTimes(1);
    });

    it('cancelBet rejects a retry with a different payload', async () => {
      betService.cancelBet = jest.fn().mockResolvedValue(makeBet('bet-1', 'CANCELED'));
      const useCase = new CancelBetUseCase(betService, idem());

      await useCase.execute({ betId: 'bet-1', reason: 'r', canceledBy: 'user-1' }, 'req-cancel-2');
      await expect(
        useCase.execute({ betId: 'bet-1', reason: 'different', canceledBy: 'user-1' }, 'req-cancel-2'),
      ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    });

    it('resolveBet (settlement) replays the same result on a repeated key', async () => {
      const won = makeBet('bet-1', 'WON');
      betService.resolveBet = jest.fn().mockResolvedValue(won);
      const useCase = new ResolveBetUseCase(betService, idem());
      const input: IResolveBetDTO = { betId: 'bet-1', result: 'WON', marketResult: 'team-a' };

      const first = await useCase.execute(input, 'req-settle-1');
      const replay = await useCase.execute(input, 'req-settle-1');

      expect(first.status).toBe('WON');
      expect(replay.status).toBe('WON');
      expect(betService.resolveBet).toHaveBeenCalledTimes(1);
    });

    it('resolveBet rejects a settlement retry with a different result on the same key', async () => {
      betService.resolveBet = jest.fn().mockResolvedValue(makeBet('bet-1', 'WON'));
      const useCase = new ResolveBetUseCase(betService, idem());

      await useCase.execute({ betId: 'bet-1', result: 'WON', marketResult: 'team-a' }, 'req-settle-2');
      await expect(
        useCase.execute({ betId: 'bet-1', result: 'LOST', marketResult: 'team-a' }, 'req-settle-2'),
      ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    });
  });
});
