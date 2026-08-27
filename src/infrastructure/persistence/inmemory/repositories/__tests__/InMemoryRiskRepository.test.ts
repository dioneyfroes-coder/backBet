import { InMemoryRiskRepository } from '../InMemoryRiskRepository';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';

describe('InMemoryRiskRepository', () => {
  let repo: InMemoryRiskRepository;

  beforeEach(() => {
    repo = new InMemoryRiskRepository();
  });

  it('should upsert and return profile via getByUserId', async () => {
    const p = new RiskProfile('user-1', 1250, 100000);
    await repo.upsert(p);

    const got = await repo.getByUserId('user-1');
    expect(got).not.toBeNull();
    expect(got?.userId).toBe('user-1');
    expect(got?.exposure).toBe(12.5);
    expect(got?.maxExposure).toBe(1000);
  });

  it('should increaseExposure and getExposure', async () => {
    await repo.upsert(new RiskProfile('user-2', 125, 50000));
    await repo.increaseExposure('user-2', 375);
    const exposure = await repo.getExposure('user-2');
    expect(exposure).toBe(5);
  });

  it('should decreaseExposure and normalize negative to zero', async () => {
    await repo.upsert(new RiskProfile('user-3', 250, 20000));
    await repo.decreaseExposure('user-3', 125);
    expect(await repo.getExposure('user-3')).toBe(1.25);

    // decrease more than current exposure -> normalize to zero
    await repo.decreaseExposure('user-3', 1000);
    expect(await repo.getExposure('user-3')).toBe(0);
  });

  it('getExposure returns 0 for unknown user', async () => {
    expect(await repo.getExposure('no-such-user')).toBe(0);
  });

  it('reserveExposure reserves within the limit and rejects over it', async () => {
    await repo.upsert(new RiskProfile('user-4', 0, 10000));

    expect(await repo.reserveExposure('user-4', 6000)).toBe(true);
    expect(await repo.getExposure('user-4')).toBe(60);

    // 6000 + 5000 > 10000 -> rejected, exposure unchanged
    expect(await repo.reserveExposure('user-4', 5000)).toBe(false);
    expect(await repo.getExposure('user-4')).toBe(60);

    // exactly the remaining headroom succeeds
    expect(await repo.reserveExposure('user-4', 4000)).toBe(true);
    expect(await repo.getExposure('user-4')).toBe(100);
    // no room left
    expect(await repo.reserveExposure('user-4', 1)).toBe(false);
  });

  it('reserveExposure creates a profile with the configured max exposure', async () => {
    const ok = await repo.reserveExposure('fresh-user', 1000);
    expect(ok).toBe(true);
    expect(await repo.getExposure('fresh-user')).toBe(10);
  });

  it('reserveExposure is atomic under concurrent contention', async () => {
    // limit of 2500 cents; each reservation is 1000 cents -> at most 2 succeed
    await repo.upsert(new RiskProfile('user-5', 0, 2500));

    const results = await Promise.all(
      Array.from({ length: 10 }, () => repo.reserveExposure('user-5', 1000)),
    );

    const successes = results.filter(Boolean).length;
    expect(successes).toBe(2);
    expect(await repo.getExposure('user-5')).toBe(20);
  });
});
