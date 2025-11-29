import { AssessBetInput, AssessBetResult } from '@/core/risk/types/risk.types';
import { RiskService } from '@/core/risk/domain/services/RiskService';

export class AssessBetRisk {
  constructor(private readonly riskService: RiskService) {}

  async execute(input: AssessBetInput): Promise<AssessBetResult> {
    // consult risk service which may call repositories or other services
    const allowed = await this.riskService.canPlaceBet(
      input.userId,
      input.stake,
      input.oddsValue,
      input.eventId,
      input.marketId,
    );
    if (allowed) {
      return { decision: 'ALLOW' };
    }

    const exposure = await this.riskService.getExposureForUser(input.userId);
    return {
      decision: 'REJECT',
      reason: 'exceeds_max_exposure',
      currentExposure: exposure,
      maxExposure: this.riskService.getMaxExposure(),
    };
  }
}
