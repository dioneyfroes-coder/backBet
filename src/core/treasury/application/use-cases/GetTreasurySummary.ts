import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { executeWithTreasuryErrorMapping } from '../errors/TreasuryErrorMapper';

export class GetTreasurySummary {
  constructor(private readonly treasuryService: HouseTreasuryService) {}

  async execute() {
    return executeWithTreasuryErrorMapping(async () => {
      const snapshot = await this.treasuryService.getSnapshot();
      return snapshot;
    });
  }
}
