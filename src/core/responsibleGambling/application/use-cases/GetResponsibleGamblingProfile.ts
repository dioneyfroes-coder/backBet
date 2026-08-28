import { ResponsibleGamblingService } from '@/core/responsibleGambling/domain/services/ResponsibleGamblingService';
import { executeWithResponsibleGamblingErrorMapping } from '@/core/responsibleGambling/application/errors/ResponsibleGamblingErrorMapper';

export class GetResponsibleGamblingProfile {
  constructor(private readonly service: ResponsibleGamblingService) {}

  async execute(userId: string) {
    return executeWithResponsibleGamblingErrorMapping(async () => {
      const profile = await this.service.getProfile(userId);
      return profile.toDTO();
    });
  }
}