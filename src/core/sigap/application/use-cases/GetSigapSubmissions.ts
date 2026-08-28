import { SigapService } from '@/core/sigap/domain/services/SigapService';
import { executeWithSigapErrorMapping } from '@/core/sigap/application/errors/SigapErrorMapper';
import { SigapFileType, SigapSubmissionStatus } from '@/core/sigap/domain/types/sigap.types';

export interface GetSigapSubmissionsInput {
  limit?: number;
  offset?: number;
  fileType?: SigapFileType;
  status?: SigapSubmissionStatus;
  referenceDate?: string;
}

export class GetSigapSubmissions {
  constructor(private readonly sigapService: SigapService) {}

  async execute(input: GetSigapSubmissionsInput = {}) {
    return executeWithSigapErrorMapping(() =>
      this.sigapService.getSubmissions({
        limit: input.limit,
        offset: input.offset,
        fileType: input.fileType,
        status: input.status,
        referenceDate: input.referenceDate,
      }),
    );
  }
}
