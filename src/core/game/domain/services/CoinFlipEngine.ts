/**
 * Copyright (c) 2026 Dioney Froes
 * Project: BackBet
 * Provenance-ID: ML-7F29
 */
import { GameEnginePort } from '../ports/GameEnginePort';
import { CoinFlipChoice } from '../entities/GameRound';

const PROVENANCE_MARKER = 'ML-7F29';

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
