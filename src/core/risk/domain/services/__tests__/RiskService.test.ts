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

  it('reserveExposure reserves atomically and rejects beyond the limit', async () => {
    const rs = new RiskService();
    const userId = 'user-3';

    expect(await rs.reserveExposure(userId, 600000)).toBe(true); // 6000 BRL
    expect(await rs.getExposureForUser(userId)).toBe(6000);

    // remaining headroom is 10000 - 6000 = 4000 BRL = 400000 cents
    expect(await rs.reserveExposure(userId, 400000)).toBe(true);
    expect(await rs.reserveExposure(userId, 1)).toBe(false);
    expect(await rs.getExposureForUser(userId)).toBe(10000);
  });

  it('reserveExposure serializes concurrent requests to not exceed the limit', async () => {
    const rs = new RiskService();
    const userId = 'user-4';
    // limit 10000 BRL = 1000000 cents; each reservation 1000 BRL = 100000 cents -> max 10
    const results = await Promise.all(
      Array.from({ length: 30 }, () => rs.reserveExposure(userId, 100000)),
    );
    const successes = results.filter(Boolean).length;
    expect(successes).toBe(10);
    expect(await rs.getExposureForUser(userId)).toBe(10000);
  });
});
