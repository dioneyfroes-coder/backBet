import { ResponsibleGamblingProfile, ResponsibleGamblingLimit } from '../entities/ResponsibleGamblingProfile';
import { IResponsibleGamblingRepository } from '../repositories/IResponsibleGamblingRepository';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { appConfig } from '@/shared/config/appConfig';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { responsibleGamblingBlockedCounter } from '@/infrastructure/observability/metrics';

/**
 * ResponsibleGamblingService — regras de jogo responsável (Fase 14).
 *
 * Bloqueia depósito/aposta por self-exclusion, time-out e limites por período.
 * As regras são determinísticas e controladas pelo usuário; o saque permanece
 * liberado (política de compliance padrão).
 */
export class ResponsibleGamblingService {
  constructor(private readonly repository: IResponsibleGamblingRepository) {}

  async assertCanDeposit(userId: string, amountCents: number): Promise<void> {
    if (!appConfig.responsibleGambling.enabled) {
      return;
    }
    const profile = await this.repository.findByUserId(userId);
    if (!profile) {
      return;
    }
    const denial = profile.checkDeposit(amountCents);
    if (denial) {
      this.block(denial, userId, 403, { operation: 'DEPOSIT', amountCents });
    }
  }

  async recordDeposit(userId: string, amountCents: number): Promise<void> {
    if (!appConfig.responsibleGambling.enabled) {
      return;
    }
    const profile = await this.repository.findByUserId(userId);
    if (!profile) {
      return;
    }
    profile.recordDeposit(amountCents);
    await this.repository.update(profile);
  }

  async assertCanBet(userId: string, amountCents: number): Promise<void> {
    if (!appConfig.responsibleGambling.enabled) {
      return;
    }
    const profile = await this.repository.findByUserId(userId);
    if (!profile) {
      return;
    }
    const denial = profile.checkBet(amountCents);
    if (denial) {
      this.block(denial, userId, 403, { operation: 'BET', amountCents });
    }
  }

  async recordBet(userId: string, amountCents: number): Promise<void> {
    if (!appConfig.responsibleGambling.enabled) {
      return;
    }
    const profile = await this.repository.findByUserId(userId);
    if (!profile) {
      return;
    }
    profile.recordBet(amountCents);
    await this.repository.update(profile);
  }

  async getProfile(userId: string): Promise<ResponsibleGamblingProfile> {
    const profile = await this.repository.findByUserId(userId);
    if (!profile) {
      const created = this.emptyProfile(userId);
      await this.repository.save(created);
      return created;
    }
    return profile;
  }

  async setSelfExclusion(userId: string, until: Date | null): Promise<ResponsibleGamblingProfile> {
    const profile = await this.getProfile(userId);
    profile.setSelfExclusion(until);
    await this.repository.update(profile);
    writeStructuredLog(
      { event: 'responsible_gambling_self_exclusion', userId, until: until?.toISOString() ?? null },
      'warn',
    );
    return profile;
  }

  async clearSelfExclusion(userId: string): Promise<ResponsibleGamblingProfile> {
    const profile = await this.getProfile(userId);
    profile.clearSelfExclusion();
    await this.repository.update(profile);
    return profile;
  }

  async setTimeOut(userId: string, until: Date | null): Promise<ResponsibleGamblingProfile> {
    const profile = await this.getProfile(userId);
    profile.setTimeOut(until);
    await this.repository.update(profile);
    return profile;
  }

  async clearTimeOut(userId: string): Promise<ResponsibleGamblingProfile> {
    const profile = await this.getProfile(userId);
    profile.clearTimeOut();
    await this.repository.update(profile);
    return profile;
  }

  async setDepositLimit(
    userId: string,
    limit: ResponsibleGamblingLimit | null,
  ): Promise<ResponsibleGamblingProfile> {
    const profile = await this.getProfile(userId);
    profile.setDepositLimit(limit);
    await this.repository.update(profile);
    return profile;
  }

  async setBetLimit(
    userId: string,
    limit: ResponsibleGamblingLimit | null,
  ): Promise<ResponsibleGamblingProfile> {
    const profile = await this.getProfile(userId);
    profile.setBetLimit(limit);
    await this.repository.update(profile);
    return profile;
  }

  private emptyProfile(userId: string): ResponsibleGamblingProfile {
    return new ResponsibleGamblingProfile(
      userId,
      false,
      null,
      null,
      null,
      null,
      new Date(),
      0,
      new Date(),
      0,
      new Date(),
    );
  }

  private block(code: string, userId: string, status: number, details: Record<string, unknown>): never {
    try {
      responsibleGamblingBlockedCounter.inc({ rule: code });
    } catch (err) {
      console.debug('responsibleGamblingBlockedCounter inc failed', err);
    }
    writeStructuredLog(
      { event: 'responsible_gambling_blocked', code, status, userId, ...details },
      'warn',
    );
    const messages: Record<string, string> = {
      SELF_EXCLUDED: 'Usuário em autoexclusão',
      TIME_OUT_ACTIVE: 'Usuário em pausa temporária (time-out)',
      DEPOSIT_LIMIT_EXCEEDED: 'Limite de depósito do período excedido',
      BET_LIMIT_EXCEEDED: 'Limite de aposta do período excedido',
    };
    throw new DomainError({
      code: `RESPONSIBLE_GAMBLING_${code}`,
      message: messages[code] ?? 'Jogo responsável',
      details: { status, userId, ...details },
    });
  }
}