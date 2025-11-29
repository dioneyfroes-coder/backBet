import { InMemoryRiskRepository } from '../InMemoryRiskRepository';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';

describe('InMemoryRiskRepository', () => {
  let repo: InMemoryRiskRepository;

  beforeEach(() => {
    repo = new InMemoryRiskRepository();
  });

  it('should upsert and return profile via getByUserId', async () => {
    const p = new RiskProfile('user-1', 12.5, 1000);
    await repo.upsert(p);

    const got = await repo.getByUserId('user-1');
    expect(got).not.toBeNull();
    expect(got?.userId).toBe('user-1');
    expect(got?.exposure).toBe(12.5);
    expect(got?.maxExposure).toBe(1000);
  });

  it('should increaseExposure and getExposure', async () => {
    await repo.upsert(new RiskProfile('user-2', 1.25, 500));
    await repo.increaseExposure('user-2', 3.75);
    const exposure = await repo.getExposure('user-2');
    expect(exposure).toBe(5);
  });

  it('should decreaseExposure and normalize negative to zero', async () => {
    await repo.upsert(new RiskProfile('user-3', 2.5, 200));
    await repo.decreaseExposure('user-3', 1.25);
    expect(await repo.getExposure('user-3')).toBe(1.25);

    // decrease more than current exposure -> normalize to zero
    await repo.decreaseExposure('user-3', 10);
    expect(await repo.getExposure('user-3')).toBe(0);
  });

  it('getExposure returns 0 for unknown user', async () => {
    expect(await repo.getExposure('no-such-user')).toBe(0);
  });
});
