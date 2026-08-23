import { randomUUID } from 'crypto';
import { cacheConfig } from '@/shared/config/cacheConfig';
import { redisClient } from '@/infrastructure/cache/RedisClient';
import { connectMongoDB, disconnectMongoDB, getMongoDBConfig } from '@/infrastructure/persistence/mongoose/config';
import { HouseTreasuryModel } from '@/infrastructure/persistence/mongoose/schemas/TreasurySchema';
import { MongooseHouseTreasuryRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseHouseTreasuryRepository';
import { HouseWallet } from '@/core/treasury/domain/entities/HouseWallet';

const runRealIntegration = process.env.RUN_REAL_INTEGRATION_TESTS === 'true';
const describeReal = runRealIntegration ? describe : describe.skip;

describeReal('MongoDB + Redis integration', () => {
  const repository = new MongooseHouseTreasuryRepository();
  const walletId = `integration-${randomUUID()}`;

  beforeAll(async () => {
    cacheConfig.enabled = true;
    await connectMongoDB(getMongoDBConfig());
    await redisClient.ping();
  });

  afterAll(async () => {
    await HouseTreasuryModel.deleteOne({ walletId });
    await redisClient.quit();
    await disconnectMongoDB();
  });

  it('reserves an idempotency key atomically in Redis', async () => {
    const key = `integration:idempotency:${randomUUID()}`;
    const first = await redisClient.setIfAbsent(key, { operation: 'deposit' }, 60);
    const second = await redisClient.setIfAbsent(key, { operation: 'deposit' }, 60);

    expect(first).toBe(true);
    expect(second).toBe(false);
    await redisClient.del(key);
  });

  it('rejects one of two concurrent Mongo updates with a stale version', async () => {
    await repository.save(HouseWallet.create(walletId, 'BRL'));
    const firstRead = await repository.getById(walletId);
    const secondRead = await repository.getById(walletId);

    firstRead!.recordProfitInflow(250);
    firstRead!.incrementVersion();
    secondRead!.recordProfitInflow(400);
    secondRead!.incrementVersion();

    const results = await Promise.allSettled([
      repository.update(firstRead!),
      repository.update(secondRead!),
    ]);
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    const persisted = await repository.getById(walletId);
    expect([250, 400]).toContain(persisted?.profitBalance);
    expect(persisted?.version).toBe(2);
  });
});