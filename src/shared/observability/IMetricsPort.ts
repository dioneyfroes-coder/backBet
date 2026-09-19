export interface ICounter {
  inc(labels?: Record<string, string | number>): void;
}

export interface IMetricsPort {
  betsPlaced: ICounter;
  betsRejected: ICounter;
  betsWon: ICounter;
  betsLost: ICounter;
  riskRejections: ICounter;
  riskReconciliationMismatch: ICounter;
  deposits: ICounter;
  withdrawals: ICounter;
  withdrawalRequestCreated: ICounter;
  withdrawalRequestApproved: ICounter;
  withdrawalRequestProcessingFailed: ICounter;
  moneySecurityBlocked: ICounter;
  complianceBlocked: ICounter;
  responsibleGamblingBlocked: ICounter;
  sigapSubmission: ICounter;
  sigapSubmissionFailure: ICounter;
  optimisticLockConflict: ICounter;
  contactSpam: ICounter;
  contactValidation: ICounter;
  idempotencyClaim: ICounter;
}

const noop: ICounter = { inc: () => undefined };

export const noopMetrics: IMetricsPort = {
  betsPlaced: noop,
  betsRejected: noop,
  betsWon: noop,
  betsLost: noop,
  riskRejections: noop,
  riskReconciliationMismatch: noop,
  deposits: noop,
  withdrawals: noop,
  withdrawalRequestCreated: noop,
  withdrawalRequestApproved: noop,
  withdrawalRequestProcessingFailed: noop,
  moneySecurityBlocked: noop,
  complianceBlocked: noop,
  responsibleGamblingBlocked: noop,
  sigapSubmission: noop,
  sigapSubmissionFailure: noop,
  optimisticLockConflict: noop,
  contactSpam: noop,
  contactValidation: noop,
  idempotencyClaim: noop,
};