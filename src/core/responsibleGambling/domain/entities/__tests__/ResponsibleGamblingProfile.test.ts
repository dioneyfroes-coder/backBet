import { ResponsibleGamblingProfile } from '../ResponsibleGamblingProfile';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = () => new Date();

describe('ResponsibleGamblingProfile — Fase 14: jogo responsável', () => {
  const emptyProfile = () =>
    new ResponsibleGamblingProfile(
      'user-1',
      false,
      null,
      null,
      null,
      null,
      now(),
      0,
      now(),
      0,
      now(),
    );

  describe('limites de depósito', () => {
    it('permite depósitos dentro do limite do período', () => {
      const profile = emptyProfile();
      profile.setDepositLimit({ amountCents: 500, period: 'DAY' });
      expect(profile.checkDeposit(200)).toBeNull();
      expect(profile.checkDeposit(300)).toBeNull();
    });

    it('bloqueia depósito que excede o limite do período', () => {
      const profile = emptyProfile();
      profile.setDepositLimit({ amountCents: 500, period: 'DAY' });
      profile.recordDeposit(450);
      expect(profile.checkDeposit(51)).toBe('DEPOSIT_LIMIT_EXCEEDED');
    });

    it('limpar o limite libera novos depósitos', () => {
      const profile = emptyProfile();
      profile.setDepositLimit({ amountCents: 500, period: 'DAY' });
      profile.setDepositLimit(null);
      expect(profile.checkDeposit(10000)).toBeNull();
    });

    it('zera o uso quando o período do depósito expira', () => {
      const profile = emptyProfile();
      profile.setDepositLimit({ amountCents: 500, period: 'DAY' });
      profile.depositPeriodStart = new Date(Date.now() - 2 * DAY_MS);
      profile.depositUsedCents = 490;
      expect(profile.checkDeposit(500)).toBeNull();
    });
  });

  describe('limites de aposta', () => {
    it('bloqueia aposta acima do limite do período', () => {
      const profile = emptyProfile();
      profile.setBetLimit({ amountCents: 1000, period: 'WEEK' });
      profile.recordBet(800);
      expect(profile.checkBet(201)).toBe('BET_LIMIT_EXCEEDED');
    });
  });

  describe('self-exclusion e time-out', () => {
    it('autoexclusão por tempo indeterminado bloqueia depósito e aposta', () => {
      const profile = emptyProfile();
      profile.setSelfExclusion(null);
      expect(profile.isIndefinitelyExcluded()).toBe(true);
      expect(profile.isSelfExcluded()).toBe(true);
      expect(profile.checkDeposit(1)).toBe('SELF_EXCLUDED');
      expect(profile.checkBet(1)).toBe('SELF_EXCLUDED');
    });

    it('autoexclusão até uma data expira depois do prazo', () => {
      const profile = emptyProfile();
      const after = new Date(Date.now() + 5000);
      profile.setSelfExclusion(new Date(Date.now() + 1000));
      expect(profile.isSelfExcluded(after)).toBe(false);
      expect(profile.checkDeposit(1, after)).toBeNull();
    });

    it('time-out ativo bloqueia depósito e aposta', () => {
      const profile = emptyProfile();
      profile.setTimeOut(new Date(Date.now() + 60 * 60 * 1000));
      expect(profile.isTimeOutActive()).toBe(true);
      expect(profile.checkDeposit(1)).toBe('TIME_OUT_ACTIVE');
      expect(profile.checkBet(1)).toBe('TIME_OUT_ACTIVE');
    });

    it('limpar a autoexclusão desbloqueia operações', () => {
      const profile = emptyProfile();
      profile.setSelfExclusion(null);
      profile.clearSelfExclusion();
      expect(profile.isSelfExcluded()).toBe(false);
      expect(profile.checkDeposit(1)).toBeNull();
    });
  });
});