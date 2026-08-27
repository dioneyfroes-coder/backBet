export type RiskDecision = 'ALLOW' | 'REJECT' | 'REVIEW';

export type RiskExposureScope = 'EVENT' | 'MARKET';

export interface AssessBetInput {
  userId: string;
  stake: number;
  oddsValue: number;
  eventId?: string;
  marketId?: string;
}

export interface AssessBetResult {
  decision: RiskDecision;
  reason?: string;
  maxExposure?: number;
  currentExposure?: number;
}
