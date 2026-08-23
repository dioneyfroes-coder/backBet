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
    return this.repository.withTransaction(async (session) => {
      const wallet = await this.loadWallet(session);
      wallet.recordProfitInflow(amount, description, metadata);
      wallet.incrementVersion();
      await this.repository.update(wallet, { session });
      return wallet.snapshot();
    });
  }

  async moveProfitToPrizeReserve(
    amount: number,
    description?: string,
    metadata?: TreasuryLedgerMetadata,
  ) {
    return this.repository.withTransaction(async (session) => {
      const wallet = await this.loadWallet(session);
      wallet.transferToPrizeReserve(amount, description, metadata);
      wallet.incrementVersion();
      await this.repository.update(wallet, { session });
      return wallet.snapshot();
    });
  }

  async movePrizeReserveToProfit(
    amount: number,
    description?: string,
    metadata?: TreasuryLedgerMetadata,
  ) {
    return this.repository.withTransaction(async (session) => {
      const wallet = await this.loadWallet(session);
      wallet.transferToProfit(amount, description, metadata);
      wallet.incrementVersion();
      await this.repository.update(wallet, { session });
      return wallet.snapshot();
    });
  }

  async rebalance(options: {
    targetPrizeRatio: number;
    minProfitBuffer: number;
    maxTransfer?: number;
  }): Promise<{ snapshot: TreasurySnapshot; result: TreasuryRebalanceResult }> {
    return this.repository.withTransaction(async (session) => {
      const wallet = await this.loadWallet(session);
      const result = wallet.rebalance(
        options.targetPrizeRatio,
        options.minProfitBuffer,
        options.maxTransfer,
      );
      if (result.transferredAmount > 0) {
        wallet.incrementVersion();
        await this.repository.update(wallet, { session });
      }
      return { snapshot: wallet.snapshot(), result };
    });
  }

  private async loadWallet(session?: unknown): Promise<HouseWallet> {
    const existing = await this.repository.getById(this.walletId, { session });
    if (existing) {
      return existing;
    }
    const created = HouseWallet.create(this.walletId, this.currency);
    await this.repository.save(created, { session });
    return created;
  }
}
