import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { TreasuryLedgerMetadata } from '@/core/treasury/domain/entities/TreasuryLedgerEntry';
import { executeWithTreasuryErrorMapping } from '../errors/TreasuryErrorMapper';
import {
  IdempotencyService,
  IDEMPOTENCY_PROCESSING_RECOVERY_MS,
} from '@/shared/services/IdempotencyService';
import { canonicalFingerprint } from '@/shared/services/fingerprint';

export class TransferProfitToPrize {
  constructor(
    private readonly treasuryService: HouseTreasuryService,
    private readonly idempotency?: IdempotencyService,
  ) {}

  async execute(
    amount: number,
    description?: string,
    metadata?: TreasuryLedgerMetadata,
    idempotencyKey?: string,
  ) {
    const transaction = () =>
      executeWithTreasuryErrorMapping(async () => {
        return this.treasuryService.moveProfitToPrizeReserve(amount, description, metadata);
      });
    if (!this.idempotency || !idempotencyKey) {
      return transaction();
    }
    return this.idempotency.execute(
      `treasury:profit-to-prize:${idempotencyKey}`,
      canonicalFingerprint({ amount, description, metadata }),
      transaction,
      undefined,
      IDEMPOTENCY_PROCESSING_RECOVERY_MS,
    );
  }
}
