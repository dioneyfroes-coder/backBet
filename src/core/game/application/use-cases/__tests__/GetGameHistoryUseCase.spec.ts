import { GetGameHistoryUseCase } from '@/core/game/application/use-cases/GetGameHistoryUseCase';
import { GameRound } from '@/core/game/domain/entities/GameRound';

const historyMock = [
  new GameRound('r1', 'user', 'COIN_FLIP', 5, 'BRL', 'HEADS', 'TAILS', 'LOSE', 0),
];

describe('GetGameHistoryUseCase', () => {
  it('should fetch rounds from repository', async () => {
    const repository = {
      findByUser: jest.fn().mockResolvedValue(historyMock),
    } as any;
    const useCase = new GetGameHistoryUseCase(repository);

    const result = await useCase.execute('user', 10);

    expect(repository.findByUser).toHaveBeenCalledWith('user', 10);
    expect(result).toEqual(historyMock);
  });
});
