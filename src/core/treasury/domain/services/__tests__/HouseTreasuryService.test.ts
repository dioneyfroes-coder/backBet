import { HouseTreasuryService } from '../HouseTreasuryService';
import { HouseTreasuryRepository } from '../../repositories/HouseTreasuryRepository';
import { IHouseTreasuryRepository } from '../../repositories/IHouseTreasuryRepository';
import { HouseWallet } from '../../entities/HouseWallet';

describe('HouseTreasuryService', () => {
  const createService = () => new HouseTreasuryService(new HouseTreasuryRepository());

  it('records profit and persists snapshot', async () => {
    const service = createService();
    const snapshot = await service.recordProfit(250_000, 'bonus');

    expect(snapshot.profitBalance).toBe(2500);
    expect(snapshot.prizeReserveBalance).toBe(0);
  });

  it('uses one repository session for the read and write', async () => {
    const session = { id: 'treasury-transaction' };
    const wallet = HouseWallet.create('house-primary');
    const getById = jest.fn().mockResolvedValue(wallet);
    const update = jest.fn().mockResolvedValue(wallet);
    const withTransaction = jest.fn() as jest.MockedFunction<
      IHouseTreasuryRepository['withTransaction']
    >;
    withTransaction.mockImplementation(async <T>(work: (session: unknown) => Promise<T>) =>
      work(session),
    );
    const repository: IHouseTreasuryRepository = {
      getById,
      save: jest.fn(),
      update,
      withTransaction,
    };

    await new HouseTreasuryService(repository).recordProfit(10_000, 'transactional profit');

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(getById).toHaveBeenCalledWith('house-primary', { session });
    expect(update).toHaveBeenCalledWith(wallet, { session });
  });

  it('rejects updates based on a stale wallet version', async () => {
    const repository = new HouseTreasuryRepository();
    await repository.save(HouseWallet.create('house-primary'));

    const firstRead = await repository.getById('house-primary');
    const secondRead = await repository.getById('house-primary');
    expect(firstRead).not.toBeNull();
    expect(secondRead).not.toBeNull();

    firstRead!.recordProfitInflow(10_000);
    firstRead!.incrementVersion();
    await repository.update(firstRead!);

    secondRead!.recordProfitInflow(20_000);
    secondRead!.incrementVersion();

    await expect(repository.update(secondRead!)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });

  it('allows only one concurrent profit update for the same wallet version', async () => {
    const repository = new HouseTreasuryRepository();
    const service = new HouseTreasuryService(repository);
    await service.recordProfit(100_000, 'seed');

    const results = await Promise.allSettled([
      service.recordProfit(25_000, 'concurrent profit A'),
      service.recordProfit(40_000, 'concurrent profit B'),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
    await expect(service.getSnapshot()).resolves.toMatchObject({
      profitBalance: expect.any(Number),
      totalBalance: expect.any(Number),
    });
    const snapshot = await service.getSnapshot();
    expect([1250, 1400]).toContain(snapshot.profitBalance);
    expect(snapshot.totalBalance).toBe(snapshot.profitBalance + snapshot.prizeReserveBalance);
  });

  it('preserves treasury balances during concurrent rebalances', async () => {
    const repository = new HouseTreasuryRepository();
    const service = new HouseTreasuryService(repository);
    await service.recordProfit(1_000_000, 'seed');

    const results = await Promise.allSettled([
      service.rebalance({ targetPrizeRatio: 0.4, minProfitBufferCents: 200_000 }),
      service.rebalance({ targetPrizeRatio: 0.4, minProfitBufferCents: 200_000 }),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
    await expect(service.getSnapshot()).resolves.toMatchObject({
      profitBalance: 6000,
      prizeReserveBalance: 4000,
      totalBalance: 10000,
    });
  });

  it('moves funds between accounts', async () => {
    const service = createService();
    await service.recordProfit(500_000, 'seed');
    const snapshot = await service.moveProfitToPrizeReserve(200_000, 'reserve top-up');

    expect(snapshot.prizeReserveBalance).toBe(2000);
    expect(snapshot.profitBalance).toBe(3000);

    const released = await service.movePrizeReserveToProfit(50_000, 'manual release');
    expect(released.profitBalance).toBe(3500);
    expect(released.prizeReserveBalance).toBe(1500);
  });

  it('rebalances using configured targets', async () => {
    const service = createService();
    await service.recordProfit(1_000_000, 'seed');

    const { result, snapshot } = await service.rebalance({
      targetPrizeRatio: 0.4,
      minProfitBufferCents: 200_000,
    });

    expect(result.direction).toBe('PROFIT_TO_RESERVE');
    expect(result.transferredAmountCents).toBeGreaterThan(0);
    expect(snapshot.prizeReserveBalance).toBeGreaterThan(0);
  });
});
