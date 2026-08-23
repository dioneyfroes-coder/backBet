import { ListAvailableGamesUseCase } from '@/core/game/application/use-cases/ListAvailableGamesUseCase';

describe('ListAvailableGamesUseCase', () => {
  it('should return games from provider snapshot', () => {
    const provider = jest.fn().mockReturnValue([
      {
        id: 'coin-flip',
        name: 'Cara ou Coroa',
        description: 'Bet on a coin toss',
        enabled: true,
        minBet: 1,
        maxBet: 100,
      },
    ]);

    const useCase = new ListAvailableGamesUseCase(provider);
    const result = useCase.execute();

    expect(provider).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('coin-flip');
  });
});
