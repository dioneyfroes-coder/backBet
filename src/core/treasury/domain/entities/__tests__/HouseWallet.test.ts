import { HouseWallet } from '../HouseWallet';
import { TreasuryLedgerEntry } from '../TreasuryLedgerEntry';

describe('HouseWallet', () => {
  it('records profit inflow and updates snapshot', () => {
    const wallet = new HouseWallet('house', 'BRL');
    wallet.recordProfitInflow(100_000, 'seed');

    const snapshot = wallet.snapshot();
    expect(snapshot.profitBalance).toBe(1000);
    expect(snapshot.profitBalanceCents).toBe(100_000);
    expect(snapshot.prizeReserveBalance).toBe(0);
  });

  it('throws when transferring more than available profit', () => {
    const wallet = new HouseWallet('house', 'BRL');
    wallet.recordProfitInflow(50_000);

    expect(() => wallet.transferToPrizeReserve(60_000)).toThrow(
      'Not enough profit balance to transfer',
    );
  });

  it('rejects non-positive amounts on every mutator', () => {
    const wallet = new HouseWallet('house', 'BRL');

    expect(() => wallet.recordProfitInflow(0)).toThrow('Amount must be positive');
    expect(() => wallet.recordProfitInflow(-100)).toThrow('Amount must be positive');

    wallet.recordProfitInflow(10_000);
    expect(() => wallet.transferToPrizeReserve(0)).toThrow('Amount must be positive');
    wallet.transferToPrizeReserve(5_000);
    expect(() => wallet.transferToProfit(0)).toThrow('Amount must be positive');
  });

  it('rebalances by allocating funds to prize reserve', () => {
    const wallet = new HouseWallet('house', 'BRL');
    wallet.recordProfitInflow(1_000_000);

    const result = wallet.rebalance(0.5, 200_000);

    expect(result.direction).toBe('PROFIT_TO_RESERVE');
    expect(result.transferredAmountCents).toBeGreaterThan(0);
    expect(wallet.prizeReserveBalance).toBeGreaterThan(0);
    expect(wallet.profitBalance).toBeGreaterThan(0);
  });

  it('rebalances by releasing funds back to profit when prize reserve is high', () => {
    const wallet = new HouseWallet('house', 'BRL');
    wallet.recordProfitInflow(500_000);
    wallet.transferToPrizeReserve(400_000);

    const result = wallet.rebalance(0.3, 50_000);

    expect(result.direction).toBe('RESERVE_TO_PROFIT');
    expect(wallet.profitBalance).toBeGreaterThan(100);
  });

  describe('ledger fidelity (saldo após operação)', () => {
    it('records direction and balance-after on every movement', () => {
      const wallet = new HouseWallet('house', 'BRL');
      wallet.recordProfitInflow(100_000, 'seed');
      wallet.transferToPrizeReserve(40_000, 'reserve');
      wallet.transferToProfit(10_000, 'release');

      const [release, topUp, inflow] = wallet.getLedger();

      expect(inflow).toMatchObject({
        type: 'PROFIT_INFLOW',
        direction: 'CREDIT',
        amountCents: 100_000,
        profitBalanceAfterCents: 100_000,
        prizeReserveBalanceAfterCents: 0,
      });
      expect(topUp).toMatchObject({
        type: 'PRIZE_TOP_UP',
        direction: 'DEBIT',
        amountCents: 40_000,
        profitBalanceAfterCents: 60_000,
        prizeReserveBalanceAfterCents: 40_000,
      });
      expect(release).toMatchObject({
        type: 'PRIZE_RELEASE',
        direction: 'CREDIT',
        amountCents: 10_000,
        profitBalanceAfterCents: 70_000,
        prizeReserveBalanceAfterCents: 30_000,
      });
    });

    it('promotes source and referenceId from metadata to first-class fields', () => {
      const wallet = new HouseWallet('house', 'BRL');
      wallet.recordProfitInflow(10_000, 'seed capital', {
        source: 'seedHouseTreasury',
        referenceId: 'seed-ref-1',
        context: 'script',
      });

      const [entry] = wallet.getLedger();
      expect(entry.source).toBe('seedHouseTreasury');
      expect(entry.referenceId).toBe('seed-ref-1');
    });
  });

  describe('reconcile()', () => {
    it('is consistent for a valid flow of operations', () => {
      const wallet = new HouseWallet('house', 'BRL');
      wallet.recordProfitInflow(1_000_000, 'seed');
      wallet.transferToPrizeReserve(300_000, 'top-up');
      wallet.rebalance(0.5, 100_000);
      wallet.transferToProfit(50_000, 'release');

      const result = wallet.reconcile();
      expect(result.consistent).toBe(true);
      expect(result.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'newest-entry-matches-current-balances', ok: true }),
          expect.objectContaining({ label: 'entries-direction-matches-type', ok: true }),
          expect.objectContaining({ label: 'consecutive-entries-consistent', ok: true }),
        ]),
      );
    });

    it('flags a wallet whose current balance diverges from the newest ledger entry', () => {
      const base = new HouseWallet('house', 'BRL');
      base.recordProfitInflow(100_000);

      const tampered = new HouseWallet('house', 'BRL', 500_000, 0, base.getLedgerEntries());

      const result = tampered.reconcile();
      expect(result.consistent).toBe(false);
      expect(
        result.checks.find((check) => check.label === 'newest-entry-matches-current-balances'),
      ).toMatchObject({ ok: false });
    });

    it('flags a broken chain between consecutive ledger entries', () => {
      const base = new HouseWallet('house', 'BRL');
      base.recordProfitInflow(100_000);
      base.transferToPrizeReserve(40_000);

      const brokenOlder = new TreasuryLedgerEntry({
        type: 'PROFIT_INFLOW',
        amountCents: 100_000,
        currency: 'BRL',
        direction: 'CREDIT',
        profitBalanceAfterCents: 90_000,
        prizeReserveBalanceAfterCents: 0,
      });
      const tampered = new HouseWallet('house', 'BRL', 60_000, 40_000, [
        base.getLedgerEntries()[0],
        brokenOlder,
      ]);

      const result = tampered.reconcile();
      expect(result.consistent).toBe(false);
      expect(
        result.checks.find((check) => check.label === 'consecutive-entries-consistent'),
      ).toMatchObject({ ok: false });
    });

    it('flags an entry whose direction does not match its type', () => {
      const base = new HouseWallet('house', 'BRL');
      base.recordProfitInflow(100_000);

      const entries = base.getLedgerEntries();
      const wrongDirection = new TreasuryLedgerEntry({
        ...entries[0],
        metadata: undefined,
        id: entries[0].id,
        createdAt: entries[0].createdAt,
        direction: 'DEBIT',
      });

      const tampered = new HouseWallet('house', 'BRL', 100_000, 0, [wrongDirection]);

      const result = tampered.reconcile();
      expect(result.consistent).toBe(false);
      expect(
        result.checks.find((check) => check.label === 'entries-direction-matches-type'),
      ).toMatchObject({ ok: false });
    });

    it('is consistent for an empty zero-balanced wallet', () => {
      const wallet = HouseWallet.create('house', 'BRL');
      expect(wallet.reconcile()).toMatchObject({ consistent: true });
    });
  });
});