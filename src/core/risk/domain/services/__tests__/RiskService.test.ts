import { RiskService } from '@/core/risk/domain/services/RiskService';

describe('RiskService (in-memory)', () => {
  it('calculates liability and exposure correctly', async () => {
    const rs = new RiskService();
    const userId = 'user-1';

    // initially exposure 0
    expect(await rs.getExposureForUser(userId)).toBe(0);

    // register exposure (50 BRL = 5000 cents)
    await rs.registerExposure(userId, 5000);
    expect(await rs.getExposureForUser(userId)).toBe(50);

    // reduce exposure (20 BRL = 2000 cents)
    await rs.reduceExposure(userId, 2000);
    expect(await rs.getExposureForUser(userId)).toBe(30);
  });

  it('blocks bets that would exceed exposure', async () => {
    const rs = new RiskService();
    const userId = 'user-2';
    // register exposure close to limit (in cents)
    const maxExposureCents = rs.getMaxExposure() * 100;
    await rs.registerExposure(userId, maxExposureCents - 1000); // 9990 BRL = 999000 cents
    // stake of 20 at odds 2 has liability of 20 BRL = 2000 cents
    // currentExposure=9990 + liability=20 = 10010 > maxExposure=10000 => blocked
    const allowed = await rs.canPlaceBet(userId, 20, 2);
    expect(allowed).toBe(false);
  });
});
