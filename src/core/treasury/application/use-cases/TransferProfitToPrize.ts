import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { TreasuryLedgerMetadata } from '@/core/treasury/domain/entities/TreasuryLedgerEntry';
import { executeWithTreasuryErrorMapping } from '../errors/TreasuryErrorMapper';

export class TransferProfitToPrize {
  constructor(private readonly treasuryService: HouseTreasuryService) {}

  async execute(amount: number, description?: string, metadata?: TreasuryLedgerMetadata) {
    return executeWithTreasuryErrorMapping(async () => {
      return this.treasuryService.moveProfitToPrizeReserve(amount, description, metadata);
    });
  }
}
