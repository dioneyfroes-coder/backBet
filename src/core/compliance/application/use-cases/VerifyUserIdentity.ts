import { ComplianceService } from '@/core/compliance/domain/services/ComplianceService';
import { executeWithComplianceErrorMapping } from '@/core/compliance/application/errors/ComplianceErrorMapper';

export interface VerifyUserIdentityInput {
  documentNumber: string;
  fullName?: string;
}

export class VerifyUserIdentity {
  constructor(private readonly complianceService: ComplianceService) {}

  async execute(userId: string, input: VerifyUserIdentityInput) {
    return executeWithComplianceErrorMapping(() =>
      this.complianceService.verifyIdentity({ userId, ...input }),
    );
  }
}