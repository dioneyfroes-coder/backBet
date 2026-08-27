import { MongooseRiskRepository } from '../MongooseRiskRepository';
import { RiskProfileModel } from '../../schemas/RiskProfileSchema';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';

describe('MongooseRiskRepository (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return profile from findOne', async () => {
    const fakeDoc = { userId: 'user-x', exposureCents: 15000, maxExposureCents: 50000 } as any;
    jest
      .spyOn(RiskProfileModel, 'findOne')
      .mockReturnValue({ lean: jest.fn().mockResolvedValue(fakeDoc) } as any);

    const repo = new MongooseRiskRepository();
    const p = await repo.getByUserId('user-x');

    expect(p).not.toBeNull();
    expect(p?.userId).toBe('user-x');
    expect(p?.exposure).toBe(150);
  });

  it('should call findOneAndUpdate on increaseExposure', async () => {
    const spy = jest.spyOn(RiskProfileModel, 'findOneAndUpdate').mockResolvedValue({} as any);
    const repo = new MongooseRiskRepository();
    await repo.increaseExposure('u1', 4200);
    expect(spy).toHaveBeenCalled();
  });

  it('should call findOneAndUpdate on decreaseExposure and normalize negative', async () => {
    const leanResult = { _id: 'abc', exposureCents: -1000 } as any;
    const spy = jest
      .spyOn(RiskProfileModel, 'findOneAndUpdate')
      .mockReturnValue({ lean: jest.fn().mockResolvedValue(leanResult) } as any);
    const findById = jest.spyOn(RiskProfileModel, 'findByIdAndUpdate').mockResolvedValue({} as any);

    const repo = new MongooseRiskRepository();
    await repo.decreaseExposure('u1', 2000);

    expect(spy).toHaveBeenCalled();
    expect(findById).toHaveBeenCalled();
  });

  it('should return exposure via getExposure', async () => {
    jest
      .spyOn(RiskProfileModel, 'findOne')
      .mockReturnValue({ lean: jest.fn().mockResolvedValue({ exposureCents: 7700 } as any) } as any);
    const repo = new MongooseRiskRepository();
    const v = await repo.getExposure('u2');
    expect(v).toBe(77);
  });

  it('reserveExposure returns true when the conditional update matches', async () => {
    const found = { lean: jest.fn().mockResolvedValue({ _id: 'x', exposureCents: 6000 } as any) };
    const spy = jest
      .spyOn(RiskProfileModel, 'findOneAndUpdate')
      .mockReturnValueOnce({} as any) // ensure-profile upsert
      .mockReturnValueOnce(found as any); // conditional increment

    const repo = new MongooseRiskRepository();
    const ok = await repo.reserveExposure('u1', 4000);

    expect(ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][1]).toEqual({ $inc: { exposureCents: 4000 } });
  });

  it('reserveExposure returns false when the conditional update matches nothing', async () => {
    const noMatch = { lean: jest.fn().mockResolvedValue(null) };
    const spy = jest
      .spyOn(RiskProfileModel, 'findOneAndUpdate')
      .mockReturnValueOnce({} as any) // ensure-profile upsert
      .mockReturnValueOnce(noMatch as any); // conditional increment -> no match

    const repo = new MongooseRiskRepository();
    const ok = await repo.reserveExposure('u1', 4000);

    expect(ok).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
