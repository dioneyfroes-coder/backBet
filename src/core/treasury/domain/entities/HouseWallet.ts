import { Currency, CurrencyValueObject } from '@/core/finance/domain/value-objects/Currency';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import {
  TreasuryLedgerEntry,
  TreasuryLedgerMetadata,
  TreasuryLedgerType,
  TreasuryLedgerDTO,
} from './TreasuryLedgerEntry';

export type TreasuryTransferDirection = 'NONE' | 'PROFIT_TO_RESERVE' | 'RESERVE_TO_PROFIT';

export type TreasurySnapshot = {
  walletId: string;
  currency: Currency;
  profitBalance: number;
  prizeReserveBalance: number;
  totalBalance: number;
};

export type TreasuryRebalanceResult = {
  direction: TreasuryTransferDirection;
  transferredAmount: number;
  targetPrizeRatio: number;
};

const LEDGER_MAX_SIZE = 50;

export class HouseWallet {
  private _profit: Money;
  private _prizeReserve: Money;
  private _ledger: TreasuryLedgerEntry[] = [];

  constructor(
    private readonly _id: string,
    currency: Currency,
    profitBalance = 0,
    prizeReserveBalance = 0,
    ledgerEntries: TreasuryLedgerEntry[] = [],
  ) {
    const normalizedCurrency = new CurrencyValueObject(currency).toString();
    this._profit = new Money(Math.max(0, profitBalance), normalizedCurrency);
    this._prizeReserve = new Money(Math.max(0, prizeReserveBalance), normalizedCurrency);
    this._ledger = [...ledgerEntries];
  }

  static create(walletId: string, currency: Currency = 'BRL'): HouseWallet {
    return new HouseWallet(walletId, currency);
  }

  get id(): string {
    return this._id;
  }

  get currency(): Currency {
    return this._profit.currency;
  }

  get profitBalance(): number {
    return this._profit.amount;
  }

  get prizeReserveBalance(): number {
    return this._prizeReserve.amount;
  }

  get totalBalance(): number {
    return this.profitBalance + this.prizeReserveBalance;
  }

  recordProfitInflow(
    amount: number,
    description?: string,
    metadata?: TreasuryLedgerMetadata,
  ): void {
    const money = this.createMoney(amount);
    this._profit = this._profit.add(money);
    this.recordLedger('PROFIT_INFLOW', amount, description, metadata);
  }

  transferToPrizeReserve(
    amount: number,
    description?: string,
    metadata?: TreasuryLedgerMetadata,
  ): void {
    const money = this.createMoney(amount);
    if (this._profit.isLessThan(money)) {
      throw new DomainError({
        code: 'TREASURY_INSUFFICIENT_PROFIT',
        message: 'Not enough profit balance to transfer',
        details: { available: this.profitBalance, requested: amount },
      });
    }
    this._profit = this._profit.subtract(money);
    this._prizeReserve = this._prizeReserve.add(money);
    this.recordLedger('PRIZE_TOP_UP', amount, description, metadata);
  }

  transferToProfit(amount: number, description?: string, metadata?: TreasuryLedgerMetadata): void {
    const money = this.createMoney(amount);
    if (this._prizeReserve.isLessThan(money)) {
      throw new DomainError({
        code: 'TREASURY_INSUFFICIENT_PRIZE_RESERVE',
        message: 'Not enough prize reserve to release',
        details: { available: this.prizeReserveBalance, requested: amount },
      });
    }
    this._prizeReserve = this._prizeReserve.subtract(money);
    this._profit = this._profit.add(money);
    this.recordLedger('PRIZE_RELEASE', amount, description, metadata);
  }

  rebalance(
    targetPrizeRatio: number,
    minProfitBuffer: number,
    maxTransfer?: number,
  ): TreasuryRebalanceResult {
    this.ensureRatio(targetPrizeRatio);
    if (!Number.isFinite(minProfitBuffer) || minProfitBuffer < 0) {
      throw new DomainError({
        code: 'TREASURY_INVALID_BUFFER',
        message: 'Profit buffer must be non-negative',
        details: { minProfitBuffer },
      });
    }

    const total = this.totalBalance;
    if (total === 0) {
      return { direction: 'NONE', transferredAmount: 0, targetPrizeRatio };
    }

    const desiredPrizeByRatio = total * targetPrizeRatio;
    const maxPrizeAfterBuffer = Math.max(0, total - minProfitBuffer);
    const desiredPrize = Math.max(0, Math.min(desiredPrizeByRatio, maxPrizeAfterBuffer));
    const diff = desiredPrize - this.prizeReserveBalance;
    const transferCap =
      typeof maxTransfer === 'number' && maxTransfer > 0 ? maxTransfer : Number.POSITIVE_INFINITY;

    if (diff > 0) {
      const availableProfit = Math.max(0, this.profitBalance - minProfitBuffer);
      const possible = Math.min(diff, availableProfit, transferCap);
      if (possible <= 0) {
        return { direction: 'NONE', transferredAmount: 0, targetPrizeRatio };
      }
      this.transferToPrizeReserve(possible, 'Automatic treasury rebalance', {
        context: 'rebalance',
        targetPrizeRatio,
        targetPrizeAmount: desiredPrize,
      });
      return { direction: 'PROFIT_TO_RESERVE', transferredAmount: possible, targetPrizeRatio };
    }

    if (diff < 0) {
      const releaseNeeded = Math.min(Math.abs(diff), this.prizeReserveBalance, transferCap);
      if (releaseNeeded <= 0) {
        return { direction: 'NONE', transferredAmount: 0, targetPrizeRatio };
      }
      this.transferToProfit(releaseNeeded, 'Automatic treasury rebalance', {
        context: 'rebalance',
        targetPrizeRatio,
        targetPrizeAmount: desiredPrize,
      });
      return { direction: 'RESERVE_TO_PROFIT', transferredAmount: releaseNeeded, targetPrizeRatio };
    }

    return { direction: 'NONE', transferredAmount: 0, targetPrizeRatio };
  }

  getLedger(limit = LEDGER_MAX_SIZE): TreasuryLedgerDTO[] {
    return this._ledger.slice(0, limit).map((entry) => entry.toDTO());
  }

  getLedgerEntries(): TreasuryLedgerEntry[] {
    return [...this._ledger];
  }

  snapshot(): TreasurySnapshot {
    return {
      walletId: this._id,
      currency: this.currency,
      profitBalance: this.profitBalance,
      prizeReserveBalance: this.prizeReserveBalance,
      totalBalance: this.totalBalance,
    };
  }

  private createMoney(amount: number): Money {
    this.ensurePositiveAmount(amount);
    return new Money(amount, this.currency);
  }

  private ensurePositiveAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new DomainError({
        code: 'TREASURY_INVALID_AMOUNT',
        message: 'Amount must be positive',
        details: { amount },
      });
    }
  }

  private ensureRatio(ratio: number): void {
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) {
      throw new DomainError({
        code: 'TREASURY_INVALID_RATIO',
        message: 'Target ratio must be between 0 and 1',
        details: { targetPrizeRatio: ratio },
      });
    }
  }

  private recordLedger(
    type: TreasuryLedgerType,
    amount: number,
    description?: string,
    metadata?: TreasuryLedgerMetadata,
  ): void {
    const entry = new TreasuryLedgerEntry(type, amount, this.currency, description, metadata);
    this._ledger.unshift(entry);
    if (this._ledger.length > LEDGER_MAX_SIZE) {
      this._ledger = this._ledger.slice(0, LEDGER_MAX_SIZE);
    }
  }
}
