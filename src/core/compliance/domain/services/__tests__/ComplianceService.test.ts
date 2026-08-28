import { ComplianceService } from '../ComplianceService';
import { IdentityVerificationRepository } from '../../repositories/IdentityVerificationRepository';
import { MockKycProvider } from '@/infrastructure/compliance/MockKycProvider';
import { DomainError } from '@/core/shared/domain/errors/DomainError';

describe('ComplianceService — Fase 14: KYC/identidade', () => {
  let repository: IdentityVerificationRepository;
  let service: ComplianceService;

  beforeEach(() => {
    repository = new IdentityVerificationRepository();
    service = new ComplianceService(repository, new MockKycProvider());
  });

  const expectBlock = async (promise: Promise<unknown>, code: string) => {
    await expect(promise).rejects.toMatchObject<Partial<DomainError>>({ code });
  };

  it('aprova documento CPF-like (11 dígitos) e persiste como VERIFIED', async () => {
    const verification = await service.verifyIdentity({
      userId: 'user-1',
      documentNumber: '12345678901',
      fullName: 'Fulano',
    });
    expect(verification.status).toBe('VERIFIED');
    const stored = await repository.findByUserId('user-1');
    expect(stored?.isVerified()).toBe(true);
    await expect(service.isIdentityVerified('user-1')).resolves.toBe(true);
  });

  it('rejeita documento sem formato CPF e marca como REJECTED', async () => {
    const verification = await service.verifyIdentity({
      userId: 'user-1',
      documentNumber: '0001',
    });
    expect(verification.status).toBe('REJECTED');
    expect(verification.rejectedReason).toBeTruthy();
    await expect(service.isIdentityVerified('user-1')).resolves.toBe(false);
  });

  it('incrementa tentativas a cada rejeição', async () => {
    await service.verifyIdentity({ userId: 'user-1', documentNumber: 'abc' });
    await service.verifyIdentity({ userId: 'user-1', documentNumber: 'abc' });
    const stored = await repository.findByUserId('user-1');
    expect(stored?.attempts).toBe(2);
  });

  it('permite saques abaixo do limite de identidade sem verificação', async () => {
    await expect(
      service.assertIdentityVerifiedForWithdrawal('user-1', 19_900),
    ).resolves.toBeUndefined();
  });

  it('bloqueia saque no/ acima do limite de identidade sem verificação', async () => {
    await expectBlock(
      service.assertIdentityVerifiedForWithdrawal('user-1', 20_000),
      'COMPLIANCE_IDENTITY_REQUIRED',
    );
  });

  it('libera saque acima do limite após verificação', async () => {
    await service.verifyIdentity({
      userId: 'user-1',
      documentNumber: '98765432109',
    });
    await expect(
      service.assertIdentityVerifiedForWithdrawal('user-1', 50_000),
    ).resolves.toBeUndefined();
  });

  it('lança COMPLIANCE_KYC_NOT_CONFIGURED sem provedor KYC', async () => {
    const withoutProvider = new ComplianceService(repository);
    await expectBlock(
      withoutProvider.verifyIdentity({ userId: 'user-1', documentNumber: '12345678901' }),
      'COMPLIANCE_KYC_NOT_CONFIGURED',
    );
  });

  it('geolocalização e integridade de dispositivo retornam livres sem provedores habilitados', async () => {
    await expect(service.assessLocation({ userId: 'user-1' })).resolves.toMatchObject({
      allowed: true,
    });
    await expect(service.assessDevice({ userId: 'user-1' })).resolves.toMatchObject({ valid: true });
  });
});