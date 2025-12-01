export type GameSummary = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  minBet: number;
  maxBet: number;
};

export class ListAvailableGamesUseCase {
  constructor(private readonly provider: () => GameSummary[]) {}

  execute(): GameSummary[] {
    return this.provider();
  }
}
