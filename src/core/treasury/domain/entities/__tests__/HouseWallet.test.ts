import { HouseWallet } from '../HouseWallet';

describe('HouseWallet', () => {
  it('records profit inflow and updates snapshot', () => {
    const wallet = new HouseWallet('house', 'BRL');
    wallet.recordProfitInflow(1000, 'seed');

    const snapshot = wallet.snapshot();
    expect(snapshot.profitBalance).toBe(1000);
    expect(snapshot.prizeReserveBalance).toBe(0);
  });

  it('throws when transferring more than available profit', () => {
    const wallet = new HouseWallet('house', 'BRL');
    wallet.recordProfitInflow(500);

    expect(() => wallet.transferToPrizeReserve(600)).toThrow(
      'Not enough profit balance to transfer',
    );
  });

  it('rebalances by allocating funds to prize reserve', () => {
    const wallet = new HouseWallet('house', 'BRL');
    wallet.recordProfitInflow(10_000);

    const result = wallet.rebalance(0.5, 2_000);

    expect(result.direction).toBe('PROFIT_TO_RESERVE');
    expect(result.transferredAmount).toBeGreaterThan(0);
    expect(wallet.prizeReserveBalance).toBeGreaterThan(0);
    expect(wallet.profitBalance).toBeGreaterThan(0);
  });

  it('rebalances by releasing funds back to profit when prize reserve is high', () => {
    const wallet = new HouseWallet('house', 'BRL');
    wallet.recordProfitInflow(5_000);
    wallet.transferToPrizeReserve(4_000);

    const result = wallet.rebalance(0.3, 500);

    expect(result.direction).toBe('RESERVE_TO_PROFIT');
    expect(wallet.profitBalance).toBeGreaterThan(1_000);
  });
});
