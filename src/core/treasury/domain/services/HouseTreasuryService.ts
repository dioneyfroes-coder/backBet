import { Currency } from '@/core/finance/domain/value-objects/Currency';
import { HouseWallet, TreasuryRebalanceResult, TreasurySnapshot } from '../entities/HouseWallet';
import { TreasuryLedgerMetadata } from '../entities/TreasuryLedgerEntry';
import { IHouseTreasuryRepository } from '../repositories/IHouseTreasuryRepository';

export type HouseTreasuryServiceOptions = {
  walletId?: string;
  currency?: Currency;
};

export class HouseTreasuryService {
  private readonly walletId: string;
  private readonly currency: Currency;

  constructor(
    private readonly repository: IHouseTreasuryRepository,
    options: HouseTreasuryServiceOptions = {},
  ) {
    this.walletId = options.walletId ?? 'house-primary';
    this.currency = options.currency ?? 'BRL';
  }

  async getSnapshot(): Promise<TreasurySnapshot> {
    const wallet = await this.loadWallet();
    return wallet.snapshot();
  }

  async getLedger(limit?: number) {
    const wallet = await this.loadWallet();
    return wallet.getLedger(limit);
  }

  async recordProfit(amount: number, description?: string, metadata?: TreasuryLedgerMetadata) {
    const wallet = await this.loadWallet();
    wallet.recordProfitInflow(amount, description, metadata);
    await this.repository.update(wallet);
    return wallet.snapshot();
  }

  async moveProfitToPrizeReserve(
    amount: number,
    description?: string,
    metadata?: TreasuryLedgerMetadata,
  ) {
    const wallet = await this.loadWallet();
    wallet.transferToPrizeReserve(amount, description, metadata);
    await this.repository.update(wallet);
    return wallet.snapshot();
  }

  async movePrizeReserveToProfit(
    amount: number,
    description?: string,
    metadata?: TreasuryLedgerMetadata,
  ) {
    const wallet = await this.loadWallet();
    wallet.transferToProfit(amount, description, metadata);
    await this.repository.update(wallet);
    return wallet.snapshot();
  }

  async rebalance(options: {
    targetPrizeRatio: number;
    minProfitBuffer: number;
    maxTransfer?: number;
  }): Promise<{ snapshot: TreasurySnapshot; result: TreasuryRebalanceResult }> {
    const wallet = await this.loadWallet();
    const result = wallet.rebalance(
      options.targetPrizeRatio,
      options.minProfitBuffer,
      options.maxTransfer,
    );
    if (result.transferredAmount > 0) {
      await this.repository.update(wallet);
    }
    return { snapshot: wallet.snapshot(), result };
  }

  private async loadWallet(): Promise<HouseWallet> {
    const existing = await this.repository.getById(this.walletId);
    if (existing) {
      return existing;
    }
    const created = HouseWallet.create(this.walletId, this.currency);
    await this.repository.save(created);
    return created;
  }
}
