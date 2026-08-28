export type KycVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface KycVerificationInput {
  userId: string;
  documentNumber: string;
  fullName?: string;
}

export interface KycVerificationOutput {
  status: KycVerificationStatus;
  reference: string;
  reason?: string;
}

/**
 * Port de provedor de verificação de identidade (KYC).
 *
 * Fase 14 mantém apenas o adapter 'mock' (regra determinística). Provedores
 * reais (CPF, biometria, prova de vida) entram como novos adapters que
 * implementam esta port, selecionados via appConfig.compliance.kyc.provider —
 * exatamente como PixProviderPort faz com pagamentos.
 */
export interface IKycProviderPort {
  verifyIdentity(input: KycVerificationInput): Promise<KycVerificationOutput>;
}