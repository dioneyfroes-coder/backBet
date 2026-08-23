import { PlayCoinFlipUseCase } from '@/core/game/application/use-cases/PlayCoinFlipUseCase';
import { GameRound } from '@/core/game/domain/entities/GameRound';

const buildRound = () =>
  new GameRound('round', 'user', 'COIN_FLIP', 10, 'BRL', 'HEADS', 'HEADS', 'WIN', 10);

describe('PlayCoinFlipUseCase', () => {
  it('should delegate execution to the game service', async () => {
    const playMock = jest.fn().mockResolvedValue(buildRound());
    const useCase = new PlayCoinFlipUseCase({ play: playMock } as any);

    const result = await useCase.execute({ userId: 'user', choice: 'HEADS', wager: 20 });

    expect(playMock).toHaveBeenCalledWith({ userId: 'user', choice: 'HEADS', wager: 20 });
    expect(result).toBeInstanceOf(GameRound);
  });
});
