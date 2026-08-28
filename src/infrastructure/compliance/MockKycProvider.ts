import { randomUUID } from 'crypto';
import {
  IKycProviderPort,
  KycVerificationInput,
  KycVerificationOutput,
} from '@/core/compliance/domain/ports/IKycProviderPort';

export interface MockKycProviderOptions {
  providerName?: string;
}

/**
 * Provedor KYC mock determinístico (regra simples para MVP):
 * documento com exatamente 11 dígitos (CPF-like) é aprovado; caso contrário é
 * rejeitado. Substituível por um provedor real implementando IKycProviderPort.
 */
export class MockKycProvider implements IKycProviderPort {
  private readonly providerName: string;

  constructor(options: MockKycProviderOptions = {}) {
    this.providerName = options.providerName ?? 'mock-kyc';
  }

  async verifyIdentity(input: KycVerificationInput): Promise<KycVerificationOutput> {
    const digits = input.documentNumber.replace(/\D/g, '');
    const valid = digits.length === 11;
    const reference = `kyc-${this.providerName}-${digits || input.userId}-${randomUUID().slice(0, 8)}`;
    return {
      status: valid ? 'VERIFIED' : 'REJECTED',
      reference,
      reason: valid ? undefined : 'Documento inválido (formato de CPF não reconhecido)',
    };
  }
}