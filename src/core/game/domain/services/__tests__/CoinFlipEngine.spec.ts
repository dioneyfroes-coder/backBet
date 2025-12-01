import { CoinFlipEngine } from '@/core/game/domain/services/CoinFlipEngine';

describe('CoinFlipEngine', () => {
  it('should return HEADS and win when rng < 0.5 and choice is HEADS', () => {
    const engine = new CoinFlipEngine(() => 0.2);
    const result = engine.play({ choice: 'HEADS' });

    expect(result).toEqual({ outcome: 'HEADS', win: true });
  });

  it('should return TAILS and lose when rng >= 0.5 and choice differs', () => {
    const engine = new CoinFlipEngine(() => 0.8);
    const result = engine.play({ choice: 'HEADS' });

    expect(result).toEqual({ outcome: 'TAILS', win: false });
  });
});
