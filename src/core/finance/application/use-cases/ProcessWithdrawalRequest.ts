import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { ApprovalAction } from '@/core/finance/domain/entities/WithdrawalRequest';
import { executeWithWalletErrorMapping } from '@/core/finance/application/errors/WalletErrorMapper';
import {
  IdempotencyService,
  IDEMPOTENCY_PROCESSING_RECOVERY_MS,
} from '@/shared/services/IdempotencyService';
import { canonicalFingerprint } from '@/shared/services/fingerprint';

export class ProcessWithdrawalRequest {
  constructor(
    private withdrawalRequestService: WithdrawalRequestService,
    private idempotency?: IdempotencyService,
  ) {}

  async execute(
    requestId: string,
    adminId: string,
    action: ApprovalAction,
    notes?: string,
    idempotencyKey?: string,
  ) {
    const transaction = () =>
      executeWithWalletErrorMapping(() =>
        this.withdrawalRequestService.processRequest(requestId, adminId, action, notes),
      );
    if (!this.idempotency || !idempotencyKey) {
      return transaction();
    }
    return this.idempotency.execute(
      `withdrawal-request-process:${requestId}:${action}:${idempotencyKey}`,
      canonicalFingerprint({ requestId, adminId, action, notes }),
      transaction,
      undefined,
      IDEMPOTENCY_PROCESSING_RECOVERY_MS,
    );
  }
}
