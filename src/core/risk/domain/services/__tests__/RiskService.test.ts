import { RiskService } from '@/core/risk/domain/services/RiskService';
import { InMemoryRiskRepository } from '@/infrastructure/persistence/inmemory/repositories/InMemoryRiskRepository';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@core/odds/domain/value-objects/Odds';

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

  describe('operational event/market counters', () => {
    it('exposes operational counter values without scanning bets', async () => {
      const riskRepository = new InMemoryRiskRepository();
      const rs = new RiskService(riskRepository, {} as any);

      await riskRepository.reserveCounter('EVENT', 'evt-1', 140000);
      await riskRepository.reserveCounter('MARKET', 'mkt-1', 90000);

      expect(await rs.getEventExposure('evt-1')).toBe(1400);
      expect(await rs.getMarketExposure('mkt-1')).toBe(900);

      // untouched scope defaults to 0
      expect(await rs.getEventExposure('other')).toBe(0);
    });

    it('reserves and reduces event and market counters', async () => {
      const riskRepository = new InMemoryRiskRepository();
      const rs = new RiskService(riskRepository, {} as any);

      expect(await rs.reserveEventExposure('evt-a', 140000)).toBe(true);
      expect(await rs.reserveMarketExposure('mkt-a', 140000)).toBe(true);
      expect(await rs.getEventExposure('evt-a')).toBe(1400);
      expect(await rs.getMarketExposure('mkt-a')).toBe(1400);

      await rs.reduceEventExposure('evt-a', 40000);
      await rs.reduceMarketExposure('mkt-a', 40000);
      expect(await rs.getEventExposure('evt-a')).toBe(1000);
      expect(await rs.getMarketExposure('mkt-a')).toBe(1000);
    });
  });

  describe('reconciliation jobs', () => {
    const pendingBet = (
      id: string,
      userId: string,
      eventId: string,
      marketId: string,
      amountCents: number,
      oddsValue: number,
    ): Bet =>
      new Bet(
        id,
        userId,
        eventId,
        marketId,
        new Money(amountCents, 'BRL'),
        new Odds(oddsValue),
        'PENDING',
        'SINGLE',
        new Date(),
        new Date(0),
        '',
      );

    it('reconciles user exposure back to the pending-bets liability on divergence', async () => {
      const riskRepository = new InMemoryRiskRepository();
      const bets = new Map<string, Bet[]>([
        ['user-r', [pendingBet('b1', 'user-r', 'evt-r', 'mkt-r', 100, 2)]],
      ]);

      const rs = new RiskService(riskRepository, {
        findByUserId: jest.fn(async (id: string) => bets.get(id) ?? []),
      } as any);

      // divergence: operational state says 9999 BRL, history says 100 BRL
      await riskRepository.upsert(new RiskProfile('user-r', 999900, 1000000));
      expect(await rs.getExposureForUser('user-r')).toBe(9999);

      const result = await rs.recalculateUserExposure('user-r');
      expect(result.reconciled).toBe(true);
      expect(result.expectedExposureCents).toBe(10000);
      expect(await rs.getExposureForUser('user-r')).toBe(100);
    });

    it('reconciles event and market counters back to the pending-bets liability', async () => {
      const riskRepository = new InMemoryRiskRepository();

      const rs = new RiskService(riskRepository, {
        findByEventId: jest.fn(async () => [
          pendingBet('b1', 'u1', 'evt-r', 'mkt-r', 5, 1.5), // liability 5 * 0.5 = 2.5 BRL
          pendingBet('b2', 'u2', 'evt-r', 'mkt-b', 5, 1.5),
        ]),
        findByMarketId: jest.fn(async () => [pendingBet('b1', 'u1', 'evt-r', 'mkt-r', 5, 1.5)]),
      } as any);

      // divergence on both counters: stored 9999 BRL, event history 5 BRL, market 2.5 BRL
      await riskRepository.reserveCounter('EVENT', 'evt-r', 999900);
      await riskRepository.reserveCounter('MARKET', 'mkt-r', 999900);
      // but reserve respects the default limit; force a divergent stored value
      await riskRepository.setCounterExposure('EVENT', 'evt-r', 999900);
      await riskRepository.setCounterExposure('MARKET', 'mkt-r', 999900);

      const eventRes = await rs.recalculateCounter('EVENT', 'evt-r');
      const marketRes = await rs.recalculateCounter('MARKET', 'mkt-r');

      expect(eventRes.reconciled).toBe(true);
      expect(eventRes.expectedExposureCents).toBe(500);
      expect(marketRes.reconciled).toBe(true);
      expect(marketRes.expectedExposureCents).toBe(250);

      await expect(rs.getEventExposure('evt-r')).resolves.toBe(5);
    });

    it('reconcileUserRisk reconciles the user plus every touched event and market', async () => {
      const riskRepository = new InMemoryRiskRepository();
      const rs = new RiskService(riskRepository, {
        findByUserId: jest.fn(async () => [
          pendingBet('b1', 'u1', 'evt-r', 'mkt-r', 100, 2),
          pendingBet('b2', 'u1', 'evt-r', 'mkt-2', 100, 2),
        ]),
        findByEventId: jest.fn(async (id: string) =>
          id === 'evt-r'
            ? [
                pendingBet('b1', 'u1', 'evt-r', 'mkt-r', 100, 2),
                pendingBet('b2', 'u1', 'evt-r', 'mkt-2', 100, 2),
              ]
            : [],
        ),
        findByMarketId: jest.fn(async (id: string) => [pendingBet('b1', 'u1', 'evt-r', id, 100, 2)]),
      } as any);

      await riskRepository.upsert(new RiskProfile('u1', 999900, 1000000));
      await riskRepository.setCounterExposure('EVENT', 'evt-r', 999900);
      await riskRepository.setCounterExposure('MARKET', 'mkt-r', 999900);
      await riskRepository.setCounterExposure('MARKET', 'mkt-2', 999900);

      const result = await rs.reconcileUserRisk('u1');
      expect(result.user.reconciled).toBe(true);
      expect(result.user.expectedExposureCents).toBe(20000);
      expect(result.counters).toHaveLength(3);
      expect(result.counters.every((c) => c.reconciled)).toBe(true);
    });
  });
});
