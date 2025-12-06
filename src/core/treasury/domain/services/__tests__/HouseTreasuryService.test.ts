import { HouseTreasuryService } from '../HouseTreasuryService';
import { HouseTreasuryRepository } from '../../repositories/HouseTreasuryRepository';

describe('HouseTreasuryService', () => {
  const createService = () => new HouseTreasuryService(new HouseTreasuryRepository());

  it('records profit and persists snapshot', async () => {
    const service = createService();
    const snapshot = await service.recordProfit(2500, 'bonus');

    expect(snapshot.profitBalance).toBe(2500);
    expect(snapshot.prizeReserveBalance).toBe(0);
  });

  it('moves funds between accounts', async () => {
    const service = createService();
    await service.recordProfit(5000, 'seed');
    const snapshot = await service.moveProfitToPrizeReserve(2000, 'reserve top-up');

    expect(snapshot.prizeReserveBalance).toBe(2000);
    expect(snapshot.profitBalance).toBe(3000);

    const released = await service.movePrizeReserveToProfit(500, 'manual release');
    expect(released.profitBalance).toBe(3500);
    expect(released.prizeReserveBalance).toBe(1500);
  });

  it('rebalances using configured targets', async () => {
    const service = createService();
    await service.recordProfit(10_000, 'seed');

    const { result, snapshot } = await service.rebalance({
      targetPrizeRatio: 0.4,
      minProfitBuffer: 2_000,
    });

    expect(result.direction).toBe('PROFIT_TO_RESERVE');
    expect(result.transferredAmount).toBeGreaterThan(0);
    expect(snapshot.prizeReserveBalance).toBeGreaterThan(0);
  });
});
