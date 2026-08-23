import { ListRecentRoundsUseCase } from '@/core/game/application/use-cases/ListRecentRoundsUseCase';

describe('ListRecentRoundsUseCase', () => {
  it('should request recent rounds from repository', async () => {
    const repository = {
      findRecent: jest.fn().mockResolvedValue(['round'] as any),
    } as any;
    const useCase = new ListRecentRoundsUseCase(repository);

    const result = await useCase.execute(5);

    expect(repository.findRecent).toHaveBeenCalledWith(5);
    expect(result).toEqual(['round']);
  });
});
