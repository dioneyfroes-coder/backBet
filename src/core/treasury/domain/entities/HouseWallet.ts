import { Currency, CurrencyValueObject } from '@/core/finance/domain/value-objects/Currency';
import { Money, SupportedCurrency } from '@/core/shared/domain/value-objects/Money';
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
  profitBalanceCents: number;
  prizeReserveBalance: number;
  prizeReserveBalanceCents: number;
  totalBalance: number;
  totalBalanceCents: number;
};

export type TreasuryRebalanceResult = {
  direction: TreasuryTransferDirection;
  transferredAmountCents: number;
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
    profitBalanceCents = 0,
    prizeReserveBalanceCents = 0,
    ledgerEntries: TreasuryLedgerEntry[] = [],
    private _version = 1,
  ) {
    const normalizedCurrency = new CurrencyValueObject(currency).toString() as SupportedCurrency;
    this._profit = Money.fromCents(Math.max(0, profitBalanceCents), normalizedCurrency);
    this._prizeReserve = Money.fromCents(Math.max(0, prizeReserveBalanceCents), normalizedCurrency);
    this._ledger = [...ledgerEntries];
  }

  static create(walletId: string, currency: Currency = 'BRL'): HouseWallet {
    return new HouseWallet(walletId, currency);
  }

  get id(): string {
    return this._id;
  }

  get version(): number {
    return this._version;
  }

  incrementVersion(): void {
    this._version += 1;
  }

  get currency(): Currency {
    return this._profit.currency;
  }

  get profitBalance(): number {
    return this._profit.amount;
  }

  get profitBalanceCents(): number {
    return this._profit.getCents();
  }

  get prizeReserveBalance(): number {
    return this._prizeReserve.amount;
  }

  get prizeReserveBalanceCents(): number {
    return this._prizeReserve.getCents();
  }

  get totalBalance(): number {
    return this._profit.add(this._prizeReserve).amount;
  }

  get totalBalanceCents(): number {
    return this._profit.add(this._prizeReserve).getCents();
  }

  recordProfitInflow(
    amountCents: number,
    description?: string,
    metadata?: TreasuryLedgerMetadata,
  ): void {
    const money = Money.fromCents(amountCents, this._profit.currency);
    this._profit = this._profit.add(money);
    this.recordLedger('PROFIT_INFLOW', amountCents, description, metadata);
  }

  transferToPrizeReserve(
    amountCents: number,
    description?: string,
    metadata?: TreasuryLedgerMetadata,
  ): void {
    const money = Money.fromCents(amountCents, this._profit.currency);
    if (this._profit.isLessThan(money)) {
      throw new DomainError({
        code: 'TREASURY_INSUFFICIENT_PROFIT',
        message: 'Not enough profit balance to transfer',
        details: { available: this.profitBalanceCents, requested: amountCents },
      });
    }
    this._profit = this._profit.subtract(money);
    this._prizeReserve = this._prizeReserve.add(money);
    this.recordLedger('PRIZE_TOP_UP', amountCents, description, metadata);
  }

  transferToProfit(amountCents: number, description?: string, metadata?: TreasuryLedgerMetadata): void {
    const money = Money.fromCents(amountCents, this._profit.currency);
    if (this._prizeReserve.isLessThan(money)) {
      throw new DomainError({
        code: 'TREASURY_INSUFFICIENT_PRIZE_RESERVE',
        message: 'Not enough prize reserve to release',
        details: { available: this.prizeReserveBalanceCents, requested: amountCents },
      });
    }
    this._prizeReserve = this._prizeReserve.subtract(money);
    this._profit = this._profit.add(money);
    this.recordLedger('PRIZE_RELEASE', amountCents, description, metadata);
  }

  rebalance(
    targetPrizeRatio: number,
    minProfitBufferCents: number,
    maxTransferCents?: number,
  ): TreasuryRebalanceResult {
    this.ensureRatio(targetPrizeRatio);
    if (!Number.isFinite(minProfitBufferCents) || minProfitBufferCents < 0) {
      throw new DomainError({
        code: 'TREASURY_INVALID_BUFFER',
        message: 'Profit buffer must be non-negative',
        details: { minProfitBufferCents },
      });
    }

    const totalCents = this.totalBalanceCents;
    if (totalCents === 0) {
      return { direction: 'NONE', transferredAmountCents: 0, targetPrizeRatio };
    }

    const desiredPrizeByRatioCents = Math.round(totalCents * targetPrizeRatio);
    const maxPrizeAfterBufferCents = Math.max(0, totalCents - minProfitBufferCents);
    const desiredPrizeCents = Math.max(0, Math.min(desiredPrizeByRatioCents, maxPrizeAfterBufferCents));
    const diffCents = desiredPrizeCents - this.prizeReserveBalanceCents;
    const transferCapCents =
      typeof maxTransferCents === 'number' && maxTransferCents > 0 ? maxTransferCents : Number.POSITIVE_INFINITY;

    if (diffCents > 0) {
      const availableProfitCents = Math.max(0, this.profitBalanceCents - minProfitBufferCents);
      const possibleCents = Math.min(diffCents, availableProfitCents, transferCapCents);
      if (possibleCents <= 0) {
        return { direction: 'NONE', transferredAmountCents: 0, targetPrizeRatio };
      }
      this.transferToPrizeReserve(possibleCents, 'Automatic treasury rebalance', {
        context: 'rebalance',
        targetPrizeRatio,
        targetPrizeAmount: desiredPrizeCents,
      });
      return { direction: 'PROFIT_TO_RESERVE', transferredAmountCents: possibleCents, targetPrizeRatio };
    }

    if (diffCents < 0) {
      const releaseNeededCents = Math.min(Math.abs(diffCents), this.prizeReserveBalanceCents, transferCapCents);
      if (releaseNeededCents <= 0) {
        return { direction: 'NONE', transferredAmountCents: 0, targetPrizeRatio };
      }
      this.transferToProfit(releaseNeededCents, 'Automatic treasury rebalance', {
        context: 'rebalance',
        targetPrizeRatio,
        targetPrizeAmount: desiredPrizeCents,
      });
      return { direction: 'RESERVE_TO_PROFIT', transferredAmountCents: releaseNeededCents, targetPrizeRatio };
    }

    return { direction: 'NONE', transferredAmountCents: 0, targetPrizeRatio };
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
      profitBalanceCents: this.profitBalanceCents,
      prizeReserveBalance: this.prizeReserveBalance,
      prizeReserveBalanceCents: this.prizeReserveBalanceCents,
      totalBalance: this.totalBalance,
      totalBalanceCents: this.totalBalanceCents,
    };
  }

  private createMoney(amountCents: number): Money {
    this.ensurePositiveAmount(amountCents);
    return Money.fromCents(amountCents, this._profit.currency);
  }

  private ensurePositiveAmount(amountCents: number): void {
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new DomainError({
        code: 'TREASURY_INVALID_AMOUNT',
        message: 'Amount must be positive',
        details: { amountCents },
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
    amountCents: number,
    description?: string,
    metadata?: TreasuryLedgerMetadata,
  ): void {
    const entry = new TreasuryLedgerEntry(type, amountCents, this.currency, description, metadata);
    this._ledger.unshift(entry);
    if (this._ledger.length > LEDGER_MAX_SIZE) {
      this._ledger = this._ledger.slice(0, LEDGER_MAX_SIZE);
    }
  }
}
