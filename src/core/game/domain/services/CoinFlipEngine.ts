import { GameEnginePort } from '../ports/GameEnginePort';
import { CoinFlipChoice } from '../entities/GameRound';

export type CoinFlipInput = {
  choice: CoinFlipChoice;
};

export type CoinFlipResult = {
  outcome: CoinFlipChoice;
  win: boolean;
};

export class CoinFlipEngine implements GameEnginePort<CoinFlipInput, CoinFlipResult> {
  constructor(private readonly rng: () => number = Math.random) {}

  play(input: CoinFlipInput): CoinFlipResult {
    const outcome: CoinFlipChoice = this.rng() < 0.5 ? 'HEADS' : 'TAILS';
    return {
      outcome,
      win: outcome === input.choice,
    };
  }
}
