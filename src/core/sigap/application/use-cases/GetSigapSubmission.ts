import { SigapService } from '@/core/sigap/domain/services/SigapService';
import { executeWithSigapErrorMapping } from '@/core/sigap/application/errors/SigapErrorMapper';

export class GetSigapSubmission {
  constructor(private readonly sigapService: SigapService) {}

  async execute(id: string) {
    return executeWithSigapErrorMapping(() => this.sigapService.getSubmissionById(id));
  }
}
