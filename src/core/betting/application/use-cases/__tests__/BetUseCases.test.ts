import { CancelBetUseCase } from '../CancelBetUseCase';
import { GetEventBetsUseCase } from '../GetEventUseCase';
import { GetUserBetsUseCase } from '../GetUserBetsUseCase';
import { ResolveBetUseCase } from '../ResolveBetUseCase';
import { BetService } from '../../../domain/services/BetService';
import { Bet } from '../../../domain/entities/Bet';
import { ICancelBetDTO, IResolveBetDTO } from '../../../types/bet.types';
import { executeWithBetErrorMapping } from '../../errors/BetErrorMapper';

jest.mock('../../errors/BetErrorMapper', () => ({
  executeWithBetErrorMapping: jest.fn(),
}));

const executeWithBetErrorMappingMock = executeWithBetErrorMapping as jest.MockedFunction<
  typeof executeWithBetErrorMapping
>;

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
});
