import { Counter } from 'prom-client';
import type { ICounter, IMetricsPort } from '@/shared/observability/IMetricsPort';
import {
  betsPlacedCounter,
  betsRejectedCounter,
  betsWonCounter,
  betsLostCounter,
  riskRejectionsCounter,
  riskReconciliationMismatchCounter,
  depositsCounter,
  withdrawalsCounter,
  withdrawalRequestCreatedCounter,
  withdrawalRequestApprovedCounter,
  withdrawalRequestProcessingFailedCounter,
  moneySecurityBlockedCounter,
  complianceBlockedCounter,
  responsibleGamblingBlockedCounter,
  sigapSubmissionCounter,
  sigapSubmissionFailureCounter,
  optimisticLockConflictCounter,
  contactSpamCounter,
  contactValidationCounter,
  idempotencyClaimCounter,
} from './metrics';

const asCounter = (counter: Counter<string>): ICounter => ({
  inc: (labels) => {
    if (labels) counter.inc(labels);
    else counter.inc();
  },
});

export const coreMetrics: IMetricsPort = {
  betsPlaced: asCounter(betsPlacedCounter),
  betsRejected: asCounter(betsRejectedCounter),
  betsWon: asCounter(betsWonCounter),
  betsLost: asCounter(betsLostCounter),
  riskRejections: asCounter(riskRejectionsCounter),
  riskReconciliationMismatch: asCounter(riskReconciliationMismatchCounter),
  deposits: asCounter(depositsCounter),
  withdrawals: asCounter(withdrawalsCounter),
  withdrawalRequestCreated: asCounter(withdrawalRequestCreatedCounter),
  withdrawalRequestApproved: asCounter(withdrawalRequestApprovedCounter),
  withdrawalRequestProcessingFailed: asCounter(withdrawalRequestProcessingFailedCounter),
  moneySecurityBlocked: asCounter(moneySecurityBlockedCounter),
  complianceBlocked: asCounter(complianceBlockedCounter),
  responsibleGamblingBlocked: asCounter(responsibleGamblingBlockedCounter),
  sigapSubmission: asCounter(sigapSubmissionCounter),
  sigapSubmissionFailure: asCounter(sigapSubmissionFailureCounter),
  optimisticLockConflict: asCounter(optimisticLockConflictCounter),
  contactSpam: asCounter(contactSpamCounter),
  contactValidation: asCounter(contactValidationCounter),
  idempotencyClaim: asCounter(idempotencyClaimCounter),
};