import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { TreasuryLedgerMetadata } from '@/core/treasury/domain/entities/TreasuryLedgerEntry';
import { executeWithTreasuryErrorMapping } from '../errors/TreasuryErrorMapper';

export class TransferPrizeToProfit {
  constructor(private readonly treasuryService: HouseTreasuryService) {}

  async execute(amount: number, description?: string, metadata?: TreasuryLedgerMetadata) {
    return executeWithTreasuryErrorMapping(async () => {
      return this.treasuryService.movePrizeReserveToProfit(amount, description, metadata);
    });
  }
}
