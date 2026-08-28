import { ResponsibleGamblingService } from '../ResponsibleGamblingService';
import { ResponsibleGamblingRepository } from '../../repositories/ResponsibleGamblingRepository';
import { DomainError } from '@/core/shared/domain/errors/DomainError';

describe('ResponsibleGamblingService — Fase 14: jogo responsável', () => {
  let repository: ResponsibleGamblingRepository;
  let service: ResponsibleGamblingService;

  beforeEach(() => {
    repository = new ResponsibleGamblingRepository();
    service = new ResponsibleGamblingService(repository);
  });

  const expectBlock = async (promise: Promise<unknown>, code: string) => {
    await expect(promise).rejects.toMatchObject<Partial<DomainError>>({ code });
  };

  it('cria perfil vazio ao consultar pela primeira vez', async () => {
    const profile = await service.getProfile('user-1');
    expect(profile.selfExcluded).toBe(false);
    expect(profile.depositLimit).toBeNull();
  });

  it('permite depósitos quando sem restrições', async () => {
    await expect(service.assertCanDeposit('user-1', 500)).resolves.toBeUndefined();
  });

  it('bloqueia depósito acima do limite configurado', async () => {
    await service.setDepositLimit('user-1', { amountCents: 500, period: 'DAY' });
    await expectBlock(
      service.assertCanDeposit('user-1', 600),
      'RESPONSIBLE_GAMBLING_DEPOSIT_LIMIT_EXCEEDED',
    );
    await expect(service.assertCanDeposit('user-1', 400)).resolves.toBeUndefined();
  });

  it('acumula uso de depósito e contabiliza no limite', async () => {
    await service.setDepositLimit('user-1', { amountCents: 500, period: 'DAY' });
    await service.recordDeposit('user-1', 400);
    await expectBlock(
      service.assertCanDeposit('user-1', 101),
      'RESPONSIBLE_GAMBLING_DEPOSIT_LIMIT_EXCEEDED',
    );
  });

  it('bloqueia apostas acima do limite configurado', async () => {
    await service.setBetLimit('user-1', { amountCents: 1000, period: 'WEEK' });
    await expectBlock(
      service.assertCanBet('user-1', 1001),
      'RESPONSIBLE_GAMBLING_BET_LIMIT_EXCEEDED',
    );
  });

  it('autoexclusão bloqueia depósito e aposta, mas preserva o perfil', async () => {
    await service.setSelfExclusion('user-1', null);
    await expectBlock(
      service.assertCanDeposit('user-1', 1),
      'RESPONSIBLE_GAMBLING_SELF_EXCLUDED',
    );
    await expectBlock(
      service.assertCanBet('user-1', 1),
      'RESPONSIBLE_GAMBLING_SELF_EXCLUDED',
    );
    const profile = await service.getProfile('user-1');
    expect(profile.isIndefinitelyExcluded()).toBe(true);
  });

  it('time-out ativo bloqueia depósito', async () => {
    await service.setTimeOut('user-1', new Date(Date.now() + 60 * 60 * 1000));
    await expectBlock(
      service.assertCanDeposit('user-1', 1),
      'RESPONSIBLE_GAMBLING_TIME_OUT_ACTIVE',
    );
  });

  it('limpar autoexclusão desbloqueia', async () => {
    await service.setSelfExclusion('user-1', null);
    await service.clearSelfExclusion('user-1');
    await expect(service.assertCanDeposit('user-1', 1)).resolves.toBeUndefined();
  });

  it('remove limite de depósito', async () => {
    await service.setDepositLimit('user-1', { amountCents: 100, period: 'DAY' });
    await service.setDepositLimit('user-1', null);
    await expect(service.assertCanDeposit('user-1', 10000)).resolves.toBeUndefined();
  });
});