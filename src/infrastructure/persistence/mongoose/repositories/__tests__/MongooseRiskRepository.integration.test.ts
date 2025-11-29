import { MongooseRiskRepository } from '../MongooseRiskRepository';
import { RiskProfileModel } from '../../schemas/RiskProfileSchema';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';

describe('MongooseRiskRepository (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return profile from findOne', async () => {
    const fakeDoc = { userId: 'user-x', exposure: 150, maxExposure: 500 } as any;
    jest.spyOn(RiskProfileModel, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue(fakeDoc) } as any);

    const repo = new MongooseRiskRepository();
    const p = await repo.getByUserId('user-x');

    expect(p).not.toBeNull();
    expect(p?.userId).toBe('user-x');
    expect(p?.exposure).toBe(150);
  });

  it('should call findOneAndUpdate on increaseExposure', async () => {
    const spy = jest.spyOn(RiskProfileModel, 'findOneAndUpdate').mockResolvedValue({} as any);
    const repo = new MongooseRiskRepository();
    await repo.increaseExposure('u1', 42);
    expect(spy).toHaveBeenCalled();
  });

  it('should call findOneAndUpdate on decreaseExposure and normalize negative', async () => {
    const spy = jest.spyOn(RiskProfileModel, 'findOneAndUpdate').mockResolvedValue({ _id: 'abc', exposure: -10 } as any);
    const findById = jest.spyOn(RiskProfileModel, 'findByIdAndUpdate').mockResolvedValue({} as any);

    const repo = new MongooseRiskRepository();
    await repo.decreaseExposure('u1', 20);

    expect(spy).toHaveBeenCalled();
    expect(findById).toHaveBeenCalled();
  });

  it('should return exposure via getExposure', async () => {
    jest.spyOn(RiskProfileModel, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue({ exposure: 77 } as any) } as any);
    const repo = new MongooseRiskRepository();
    const v = await repo.getExposure('u2');
    expect(v).toBe(77);
  });
});
