import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { executeWithTreasuryErrorMapping } from '../errors/TreasuryErrorMapper';

export class GetTreasuryLedger {
  constructor(private readonly treasuryService: HouseTreasuryService) {}

  async execute(limit?: number) {
    return executeWithTreasuryErrorMapping(async () => {
      return this.treasuryService.getLedger(limit);
    });
  }
}
