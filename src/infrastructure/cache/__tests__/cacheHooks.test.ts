import {
  cacheWalletBalance,
  cacheWalletHistory,
  cacheUserProfile,
  cacheEventOdds,
  flushWalletCache,
  flushUserProfileCache,
  flushEventOddsCache,
} from '../cacheHooks';
import { cacheTTL } from '../cacheKeys';
import { cacheConfig } from '@/shared/config/cacheConfig';
import { redisClient } from '../RedisClient';

jest.mock('../RedisClient', () => ({
  redisClient: {
    cached: jest.fn(),
    del: jest.fn(),
  },
}));

describe('cache hooks', () => {
  const cachedMock = redisClient.cached as jest.Mock;
  const delMock = redisClient.del as jest.Mock;
  const loader = jest.fn().mockResolvedValue('value');

  beforeEach(() => {
    cacheConfig.enabled = true;
    cachedMock.mockReset().mockResolvedValue('value');
    delMock.mockReset();
    loader.mockClear();
  });

  it('caches wallet balance/history/profile/event odds with proper TTLs', async () => {
    await cacheWalletBalance('user-1', loader);
    expect(cachedMock).toHaveBeenCalledWith(
      'wallet:balance:user-1',
      cacheTTL.walletBalance,
      loader,
    );

    await cacheWalletHistory('user-1', loader);
    expect(cachedMock).toHaveBeenCalledWith(
      'wallet:history:user-1',
      cacheTTL.walletHistory,
      loader,
    );

    await cacheUserProfile('user-1', loader);
    expect(cachedMock).toHaveBeenCalledWith('user:profile:user-1', cacheTTL.userProfile, loader);

    await cacheEventOdds('event-1', loader);
    expect(cachedMock).toHaveBeenCalledWith('event:odds:event-1', cacheTTL.oddsForEvent, loader);
  });

  it('flushes cache entries as expected', async () => {
    await flushWalletCache('user-1');
    expect(delMock).toHaveBeenCalledWith('wallet:balance:user-1');
    expect(delMock).toHaveBeenCalledWith('wallet:history:user-1');

    await flushUserProfileCache('user-1');
    expect(delMock).toHaveBeenCalledWith('user:profile:user-1');

    await flushEventOddsCache('event-1');
    expect(delMock).toHaveBeenCalledWith('event:odds:event-1');
  });
});
