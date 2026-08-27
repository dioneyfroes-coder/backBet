import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { executeWithTreasuryErrorMapping } from '../errors/TreasuryErrorMapper';

export class ReconcileTreasury {
  constructor(private readonly treasuryService: HouseTreasuryService) {}

  async execute() {
    return executeWithTreasuryErrorMapping(async () => {
      return this.treasuryService.reconcile();
    });
  }
}