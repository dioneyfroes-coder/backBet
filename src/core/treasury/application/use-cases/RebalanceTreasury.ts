import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { executeWithTreasuryErrorMapping } from '../errors/TreasuryErrorMapper';

export type RebalanceTreasuryInput = {
  targetPrizeRatio: number;
  minProfitBuffer: number;
  maxTransfer?: number;
};

export class RebalanceTreasury {
  constructor(private readonly treasuryService: HouseTreasuryService) {}

  async execute(input: RebalanceTreasuryInput) {
    return executeWithTreasuryErrorMapping(async () => {
      return this.treasuryService.rebalance(input);
    });
  }
}
