import { RiskService } from '@/core/risk/domain/services/RiskService';

describe('RiskService (in-memory)', () => {
  it('calculates liability and exposure correctly', async () => {
    const rs = new RiskService();
    const userId = 'user-1';

    // initially exposure 0
    expect(await rs.getExposureForUser(userId)).toBe(0);

    // register exposure
    await rs.registerExposure(userId, 50);
    expect(await rs.getExposureForUser(userId)).toBe(50);

    // reduce exposure
    await rs.reduceExposure(userId, 20);
    expect(await rs.getExposureForUser(userId)).toBe(30);
  });

  it('blocks bets that would exceed exposure', async () => {
    const rs = new RiskService();
    const userId = 'user-2';
    // register current exposure close to limit
    await rs.registerExposure(userId, rs.getMaxExposure() - 10);
    // stake that would push beyond max
    const allowed = await rs.canPlaceBet(userId, 20, 2); // liability 20*(2-1)=20 -> exceeds
    expect(allowed).toBe(false);
  });
});
