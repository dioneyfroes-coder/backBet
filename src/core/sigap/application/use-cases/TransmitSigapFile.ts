import { SigapService } from '@/core/sigap/domain/services/SigapService';
import { executeWithSigapErrorMapping } from '@/core/sigap/application/errors/SigapErrorMapper';
import { SigapFileType, SigapPayloadRecord } from '@/core/sigap/domain/types/sigap.types';

export interface TransmitSigapFileInput {
  fileType: SigapFileType;
  referenceDate: string;
  payload: SigapPayloadRecord[];
  operatorId?: string;
}

export class TransmitSigapFile {
  constructor(private readonly sigapService: SigapService) {}

  async execute(input: TransmitSigapFileInput) {
    return executeWithSigapErrorMapping(() =>
      this.sigapService.transmitFile({
        fileType: input.fileType,
        referenceDate: input.referenceDate,
        payload: input.payload,
        operatorId: input.operatorId,
      }),
    );
  }
}
