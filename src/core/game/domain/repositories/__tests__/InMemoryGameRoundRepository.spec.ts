import { InMemoryGameRoundRepository } from '@/core/game/domain/repositories/InMemoryGameRoundRepository';
import { GameRound } from '@/core/game/domain/entities/GameRound';

describe('InMemoryGameRoundRepository', () => {
  const buildRound = (id: string, userId: string, createdAt: string) =>
    new GameRound(id, userId, 'COIN_FLIP', 10, 'BRL', 'HEADS', 'HEADS', 'WIN', 10, new Date(createdAt));

  it('should store rounds and return most recent first', async () => {
    const repo = new InMemoryGameRoundRepository();
    const rounds = [
      buildRound('r1', 'user-a', '2025-01-01T10:00:00Z'),
      buildRound('r2', 'user-a', '2025-01-02T10:00:00Z'),
      buildRound('r3', 'user-b', '2025-01-03T10:00:00Z'),
    ];

    await Promise.all(rounds.map((round) => repo.create(round)));

    const recent = await repo.findRecent(2);
    expect(recent.map((r) => r.id)).toEqual(['r3', 'r2']);

    const userHistory = await repo.findByUser('user-a', 5);
    expect(userHistory.map((r) => r.id)).toEqual(['r2', 'r1']);
  });
});
