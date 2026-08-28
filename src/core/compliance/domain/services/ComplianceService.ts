import { IdentityVerification } from '../entities/IdentityVerification';
import { IIdentityVerificationRepository } from '../repositories/IIdentityVerificationRepository';
import {
  IKycProviderPort,
  KycVerificationInput,
} from '../ports/IKycProviderPort';
import {
  IGeolocationProviderPort,
  GeolocationAssessmentInput,
  GeolocationAssessment,
} from '../ports/IGeolocationProviderPort';
import {
  IDeviceIntegrityProviderPort,
  DeviceIntegrityInput,
  DeviceIntegrityAssessment,
} from '../ports/IDeviceIntegrityProviderPort';
import { UniqueId } from '@/core/shared/domain/value-objects/UniqueId';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { appConfig } from '@/shared/config/appConfig';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { complianceBlockedCounter } from '@/infrastructure/observability/metrics';

/**
 * ComplianceService — preparação modular de compliance (Fase 14).
 *
 * Orquestra provedores plugáveis (KYC, geolocalização, integridade de
 * dispositivo) através de ports/adapters, exatamente como Pix/pagamentos.
 *
 * Hoje executa uma regra determinística de pré-segurança:
 *  - saques acima de appConfig.compliance.withdrawal.requiresVerifiedIdentityAboveCents
 *    exigem identidade verificada (COMPLIANCE_IDENTITY_REQUIRED -> 403).
 *
 * Provedores reais (CPF/biometria/prova de vida via KYC, VPN/proxy via
 * geolocalização, tamper via device integrity) são adicionados como novos
 * adapters implementando as ports, selecionados por appConfig.compliance.*.
 */
export class ComplianceService {
  constructor(
    private readonly verificationRepository: IIdentityVerificationRepository,
    private readonly kycProvider?: IKycProviderPort,
    private readonly geolocationProvider?: IGeolocationProviderPort,
    private readonly deviceIntegrityProvider?: IDeviceIntegrityProviderPort,
  ) {}

  async verifyIdentity(input: KycVerificationInput): Promise<IdentityVerification> {
    if (!appConfig.compliance.kyc.enabled || !this.kycProvider) {
      throw new DomainError({
        code: 'COMPLIANCE_KYC_NOT_CONFIGURED',
        message: 'Verificação de identidade não configurada',
        details: { userId: input.userId },
      });
    }

    let record = await this.verificationRepository.findByUserId(input.userId);
    const persistence =
      record === null ? 'save' : 'update';

    if (!record) {
      record = new IdentityVerification(
        new UniqueId().value,
        input.userId,
        'PENDING',
        this.kycProvider.constructor.name,
        '',
        0,
        new Date(),
        new Date(),
      );
      await this.verificationRepository.save(record);
    }

    const result = await this.kycProvider.verifyIdentity(input);

    if (result.status === 'VERIFIED') {
      record.markVerified(result.reference);
    } else if (result.status === 'REJECTED') {
      record.markRejected(result.reason ?? 'KYC_REJECTED');
    }

    if (persistence === 'save') {
      await this.verificationRepository.save(record);
    } else {
      await this.verificationRepository.update(record);
    }

    writeStructuredLog(
      {
        event: 'compliance_identity_result',
        status: record.status,
        userId: input.userId,
        provider: record.provider,
        reference: record.providerReference,
        attempts: record.attempts,
        reason: record.rejectedReason,
      },
      record.status === 'REJECTED' ? 'warn' : 'info',
    );

    return record;
  }

  async getVerification(userId: string): Promise<IdentityVerification | null> {
    return this.verificationRepository.findByUserId(userId);
  }

  async isIdentityVerified(userId: string): Promise<boolean> {
    const record = await this.verificationRepository.findByUserId(userId);
    return record ? record.isVerified() : false;
  }

  /**
   * Gate de pré-segurança: saques acima do limite exigem identidade verificada.
   */
  async assertIdentityVerifiedForWithdrawal(userId: string, amountCents: number): Promise<void> {
    const threshold = appConfig.compliance.withdrawal.requiresVerifiedIdentityAboveCents;
    if (amountCents < threshold) {
      return;
    }
    const verified = await this.isIdentityVerified(userId);
    if (!verified) {
      this.block('COMPLIANCE_IDENTITY_REQUIRED', userId, 403, {
        requiredAboveCents: threshold,
        requestedCents: amountCents,
        operation: 'WITHDRAWAL',
      });
    }
  }

  async assessLocation(input: GeolocationAssessmentInput): Promise<GeolocationAssessment> {
    if (appConfig.compliance.geolocation.enabled && this.geolocationProvider) {
      return this.geolocationProvider.assessLocation(input);
    }
    return { allowed: true, provider: 'none' };
  }

  async assessDevice(input: DeviceIntegrityInput): Promise<DeviceIntegrityAssessment> {
    if (appConfig.compliance.deviceIntegrity.enabled && this.deviceIntegrityProvider) {
      return this.deviceIntegrityProvider.assessDevice(input);
    }
    return { valid: true, provider: 'none' };
  }

  private block(
    code: string,
    userId: string,
    status: number,
    details: Record<string, unknown>,
  ): never {
    try {
      complianceBlockedCounter.inc({ rule: code });
    } catch (err) {
      console.debug('complianceBlockedCounter inc failed', err);
    }
    writeStructuredLog(
      {
        event: 'compliance_blocked',
        code,
        status,
        userId,
        ...details,
      },
      'warn',
    );
    throw new DomainError({ code, message: code, details: { status, userId, ...details } });
  }
}