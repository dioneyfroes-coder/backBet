import { MongooseRiskRepository } from '../MongooseRiskRepository';
import { RiskProfileModel } from '../../schemas/RiskProfileSchema';
import { RiskExposureCounterModel } from '../../schemas/RiskExposureCounterSchema';
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

  describe('exposure counters', () => {
    const chainable = (result: unknown, withSession = false) => {
      const q: any = { lean: jest.fn().mockResolvedValue(result) };
      if (withSession) {
        q.session = jest.fn().mockReturnValue(q);
        q.then = undefined;
      } else {
        q.session = jest.fn().mockReturnThis();
      }
      return q;
    };

    it('getCounter returns null when no counter exists', async () => {
      jest
        .spyOn(RiskExposureCounterModel, 'findOne')
        .mockReturnValue(chainable(null) as any);
      const repo = new MongooseRiskRepository();
      expect(await repo.getCounter('EVENT', 'evt-1')).toBeNull();
    });

    it('getCounter maps a stored record to the domain entity', async () => {
      jest
        .spyOn(RiskExposureCounterModel, 'findOne')
        .mockReturnValue(
          chainable({ _id: 'abc', scope: 'MARKET', refId: 'mkt-1', exposureCents: 125000, maxExposureCents: 300000 }) as any,
        );
      const repo = new MongooseRiskRepository();
      const counter = await repo.getCounter('MARKET', 'mkt-1');
      expect(counter?.refId).toBe('mkt-1');
      expect(counter?.exposureCents).toBe(125000);
      expect(counter?.maxExposureCents).toBe(300000);
    });

    it('reserveCounter returns true when the conditional increment matches', async () => {
      const spy = jest
        .spyOn(RiskExposureCounterModel, 'findOneAndUpdate')
        .mockReturnValueOnce({} as any) // ensure-profile upsert
        .mockReturnValueOnce(
          chainable({ _id: 'x', scope: 'EVENT', refId: 'evt-1', exposureCents: 140000 }, true) as any,
        );
      const repo = new MongooseRiskRepository();
      const ok = await repo.reserveCounter('EVENT', 'evt-1', 140000);

      expect(ok).toBe(true);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls[1][1]).toEqual({ $inc: { exposureCents: 140000 } });
    });

    it('reserveCounter returns false when the conditional increment matches nothing', async () => {
      jest
        .spyOn(RiskExposureCounterModel, 'findOneAndUpdate')
        .mockReturnValueOnce({} as any) // ensure
        .mockReturnValueOnce(chainable(null, true) as any); // no match
      const repo = new MongooseRiskRepository();
      expect(await repo.reserveCounter('EVENT', 'evt-1', 140000)).toBe(false);
    });

    it('setCounterExposure upserts the requested exposure', async () => {
      const spy = jest
        .spyOn(RiskExposureCounterModel, 'findOneAndUpdate')
        .mockReturnValue({} as any);
      const repo = new MongooseRiskRepository();
      await repo.setCounterExposure('EVENT', 'evt-1', 50000);
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][1]).toEqual({
        $set: { exposureCents: 50000 },
        $setOnInsert: { scope: 'EVENT', refId: 'evt-1', maxExposureCents: expect.any(Number) },
      });
    });
  });
});
