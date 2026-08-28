import { SigapService } from '@/core/sigap/domain/services/SigapService';
import { executeWithSigapErrorMapping } from '@/core/sigap/application/errors/SigapErrorMapper';

export class CheckSigapImpediment {
  constructor(private readonly sigapService: SigapService) {}

  async execute(documentNumber: string) {
    return executeWithSigapErrorMapping(() =>
      this.sigapService.checkImpediment(documentNumber),
    );
  }
}
