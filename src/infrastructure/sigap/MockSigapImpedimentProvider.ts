import { ISigapImpedimentPort } from '@/core/sigap/domain/ports/ISigapImpedimentPort';
import { SigapImpedimentResult } from '@/core/sigap/domain/types/sigap.types';

export interface MockSigapImpedimentProviderOptions {
  providerName?: string;
  /** Documentos (CPF) que devem ser marcados como impedidos (teste/MVP). */
  impededDocuments?: string[];
}

/**
 * Provedor mock de consulta de impedimento no SIGAP. Retorna IMPEDED para um
 * conjunto de documentos configurado e NOT_IMPEDED para os demais; adequado
 * para testes e demonstração. A integração real consumiria o endpoint da SPA.
 */
export class MockSigapImpedimentProvider implements ISigapImpedimentPort {
  private readonly providerName: string;
  private readonly impededDocuments: Set<string>;

  constructor(options: MockSigapImpedimentProviderOptions = {}) {
    this.providerName = options.providerName ?? 'mock-sigap-impediment';
    this.impededDocuments = new Set((options.impededDocuments ?? []).map((d) => d.replace(/\D/g, '')));
  }

  async checkImpediment(documentNumber: string): Promise<SigapImpedimentResult> {
    const digits = documentNumber.replace(/\D/g, '');
    const impeded = this.impededDocuments.has(digits);
    return {
      status: impeded ? 'IMPEDED' : 'NOT_IMPEDED',
      reference: `${this.providerName}-${digits || 'unknown'}`,
    };
  }
}
