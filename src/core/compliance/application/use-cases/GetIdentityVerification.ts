import { ComplianceService } from '@/core/compliance/domain/services/ComplianceService';

export class GetIdentityVerification {
  constructor(private readonly complianceService: ComplianceService) {}

  async execute(userId: string) {
    const record = await this.complianceService.getVerification(userId);
    return record ? record.toDTO() : null;
  }
}