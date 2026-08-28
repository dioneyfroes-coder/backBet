export type IdentityVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

/**
 * Registro de verificação de identidade de um usuário.
 *
 * Guarda o estado da verificação (PENDING -> VERIFIED | REJECTED), o provedor
 * que a executou e a referência retornada por ele (rastreabilidade/auditoria).
 */
export class IdentityVerification {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public status: IdentityVerificationStatus,
    public provider: string,
    public providerReference: string,
    public attempts: number,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public verifiedAt: Date | null = null,
    public rejectedReason: string | null = null,
  ) {}

  markVerified(reference: string): void {
    this.status = 'VERIFIED';
    this.providerReference = reference;
    this.verifiedAt = new Date();
    this.updatedAt = new Date();
  }

  markRejected(reason: string): void {
    this.status = 'REJECTED';
    this.rejectedReason = reason;
    this.attempts += 1;
    this.updatedAt = new Date();
  }

  isVerified(): boolean {
    return this.status === 'VERIFIED';
  }

  toDTO(): Record<string, unknown> {
    return {
      id: this.id,
      userId: this.userId,
      status: this.status,
      provider: this.provider,
      providerReference: this.providerReference,
      attempts: this.attempts,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      verifiedAt: this.verifiedAt ? this.verifiedAt.toISOString() : null,
      rejectedReason: this.rejectedReason,
    };
  }
}