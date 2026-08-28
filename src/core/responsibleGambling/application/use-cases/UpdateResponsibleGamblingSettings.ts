import { ResponsibleGamblingService } from '@/core/responsibleGambling/domain/services/ResponsibleGamblingService';
import { ResponsibleGamblingPeriod } from '@/core/responsibleGambling/domain/entities/ResponsibleGamblingProfile';
import { executeWithResponsibleGamblingErrorMapping } from '@/core/responsibleGambling/application/errors/ResponsibleGamblingErrorMapper';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { appConfig } from '@/shared/config/appConfig';

export interface ResponsibleGamblingLimitInput {
  amountCents: number;
  period: ResponsibleGamblingPeriod;
}

export interface UpdateResponsibleGamblingSettingsInput {
  /** 'indefinite' = autoexclusão por tempo indeterminado; string de data = até aquela data; null = limpar */
  selfExclusionUntil?: 'indefinite' | string | null;
  clearSelfExclusion?: boolean;
  /** string de data = aplicar time-out até aquela data; null = limpar */
  timeOutUntil?: string | null;
  /** definição ou remoção do limite de depósito por período */
  depositLimit?: ResponsibleGamblingLimitInput | null;
  /** definição ou remoção do limite de aposta por período */
  betLimit?: ResponsibleGamblingLimitInput | null;
}

const VALID_PERIODS: ResponsibleGamblingPeriod[] = ['DAY', 'WEEK', 'MONTH'];

export class UpdateResponsibleGamblingSettings {
  constructor(private readonly service: ResponsibleGamblingService) {}

  async execute(userId: string, input: UpdateResponsibleGamblingSettingsInput) {
    return executeWithResponsibleGamblingErrorMapping(async () => {
      let profile;

      if (input.selfExclusionUntil !== undefined) {
        profile = await this.service.setSelfExclusion(
          userId,
          this.parseSelfExclusionUntil(input.selfExclusionUntil),
        );
      } else if (input.clearSelfExclusion) {
        profile = await this.service.clearSelfExclusion(userId);
      }

      if (input.timeOutUntil !== undefined) {
        profile = await this.service.setTimeOut(userId, this.parseTimeOutUntil(input.timeOutUntil));
      }

      if (input.depositLimit !== undefined) {
        profile = await this.service.setDepositLimit(
          userId,
          input.depositLimit ? this.validateLimit(input.depositLimit, 'deposit') : null,
        );
      }

      if (input.betLimit !== undefined) {
        profile = await this.service.setBetLimit(
          userId,
          input.betLimit ? this.validateLimit(input.betLimit, 'bet') : null,
        );
      }

      if (!profile) {
        profile = await this.service.getProfile(userId);
      }

      return profile.toDTO();
    });
  }

  private parseSelfExclusionUntil(value: 'indefinite' | string | null): Date | null {
    if (value === null) {
      return null;
    }
    if (value === 'indefinite') {
      return null;
    }
    return this.parseDate(value, 'RESPONSIBLE_GAMBLING_INVALID_DATE');
  }

  private parseTimeOutUntil(value: string | null): Date | null {
    if (value === null) {
      return null;
    }
    return this.parseDate(value, 'RESPONSIBLE_GAMBLING_INVALID_DATE');
  }

  private parseDate(value: string, code: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new DomainError({ code, message: 'Data inválida', details: { value } });
    }
    return date;
  }

  private validateLimit(
    limit: ResponsibleGamblingLimitInput,
    type: 'deposit' | 'bet',
  ): ResponsibleGamblingLimitInput {
    const min =
      type === 'deposit'
        ? appConfig.responsibleGambling.minDepositLimitCents
        : appConfig.responsibleGambling.minBetLimitCents;
    if (!Number.isInteger(limit.amountCents) || limit.amountCents < min) {
      throw new DomainError({
        code: 'RESPONSIBLE_GAMBLING_INVALID_LIMIT',
        message: `Limite de ${type} deve ser de no mínimo ${min} centavos`,
        details: { min, type },
      });
    }
    if (!VALID_PERIODS.includes(limit.period)) {
      throw new DomainError({
        code: 'RESPONSIBLE_GAMBLING_INVALID_LIMIT',
        message: 'Período inválido',
        details: { period: limit.period },
      });
    }
    return limit;
  }
}