import { DomainError } from '@/core/shared/domain/errors/DomainError';

export type ResponsibleGamblingPeriod = 'DAY' | 'WEEK' | 'MONTH';

export interface ResponsibleGamblingLimit {
  amountCents: number;
  period: ResponsibleGamblingPeriod;
}

export type ResponsibleGamblingDenial =
  | 'SELF_EXCLUDED'
  | 'TIME_OUT_ACTIVE'
  | 'DEPOSIT_LIMIT_EXCEEDED'
  | 'BET_LIMIT_EXCEEDED'
  | null;

/**
 * Perfil de jogo responsável por usuário (Fase 14).
 *
 * Regras determinísticas, todas controláveis pelo próprio usuário:
 *  - self-exclusion (bloqueio total de depósito/aposta; saque continua liberado);
 *  - time-out (pausa temporária);
 *  - limite de depósito por período (DAY/WEEK/MONTH);
 *  - limite de aposta por período.
 */
export class ResponsibleGamblingProfile {
  constructor(
    public readonly userId: string,
    public selfExcluded: boolean,
    public selfExclusionUntil: Date | null,
    public timeOutUntil: Date | null,
    public depositLimit: ResponsibleGamblingLimit | null,
    public betLimit: ResponsibleGamblingLimit | null,
    public depositPeriodStart: Date,
    public depositUsedCents: number,
    public betPeriodStart: Date,
    public betUsedCents: number,
    public updatedAt: Date,
  ) {}

  setSelfExclusion(until: Date | null): void {
    if (until !== null && until.getTime() < Date.now()) {
      this.throwInvalidDate();
    }
    this.selfExcluded = true;
    this.selfExclusionUntil = until;
    this.updatedAt = new Date();
  }

  clearSelfExclusion(): void {
    this.selfExcluded = false;
    this.selfExclusionUntil = null;
    this.updatedAt = new Date();
  }

  setTimeOut(until: Date | null): void {
    if (until !== null && until.getTime() < Date.now()) {
      this.throwInvalidDate();
    }
    this.timeOutUntil = until;
    this.updatedAt = new Date();
  }

  clearTimeOut(): void {
    this.timeOutUntil = null;
    this.updatedAt = new Date();
  }

  setDepositLimit(limit: ResponsibleGamblingLimit | null): void {
    this.depositLimit = limit;
    this.depositPeriodStart = new Date();
    this.depositUsedCents = 0;
    this.updatedAt = new Date();
  }

  setBetLimit(limit: ResponsibleGamblingLimit | null): void {
    this.betLimit = limit;
    this.betPeriodStart = new Date();
    this.betUsedCents = 0;
    this.updatedAt = new Date();
  }

  isIndefinitelyExcluded(): boolean {
    return this.selfExcluded && this.selfExclusionUntil === null;
  }

  isSelfExcluded(now: Date = new Date()): boolean {
    if (!this.selfExcluded) {
      return false;
    }
    return this.selfExclusionUntil === null || this.selfExclusionUntil.getTime() > now.getTime();
  }

  isTimeOutActive(now: Date = new Date()): boolean {
    return this.timeOutUntil !== null && this.timeOutUntil.getTime() > now.getTime();
  }

  /**
   * Retorna o motivo de negação de depósito, ou null se permitido.
   */
  checkDeposit(amountCents: number, now: Date = new Date()): ResponsibleGamblingDenial {
    if (this.isSelfExcluded(now)) {
      return 'SELF_EXCLUDED';
    }
    if (this.isTimeOutActive(now)) {
      return 'TIME_OUT_ACTIVE';
    }
    if (this.depositLimit) {
      this.refreshDepositUsage(now);
      if (this.depositUsedCents + amountCents > this.depositLimit.amountCents) {
        return 'DEPOSIT_LIMIT_EXCEEDED';
      }
    }
    return null;
  }

  /**
   * Retorna o motivo de negação de aposta, ou null se permitido.
   */
  checkBet(amountCents: number, now: Date = new Date()): ResponsibleGamblingDenial {
    if (this.isSelfExcluded(now)) {
      return 'SELF_EXCLUDED';
    }
    if (this.isTimeOutActive(now)) {
      return 'TIME_OUT_ACTIVE';
    }
    if (this.betLimit) {
      this.refreshBetUsage(now);
      if (this.betUsedCents + amountCents > this.betLimit.amountCents) {
        return 'BET_LIMIT_EXCEEDED';
      }
    }
    return null;
  }

  recordDeposit(amountCents: number, now: Date = new Date()): void {
    this.refreshDepositUsage(now);
    this.depositUsedCents += amountCents;
    this.updatedAt = new Date();
  }

  recordBet(amountCents: number, now: Date = new Date()): void {
    this.refreshBetUsage(now);
    this.betUsedCents += amountCents;
    this.updatedAt = new Date();
  }

  toDTO(): Record<string, unknown> {
    return {
      userId: this.userId,
      selfExcluded: this.isSelfExcluded(),
      selfExclusionUntil: this.selfExclusionUntil ? this.selfExclusionUntil.toISOString() : null,
      timeOutUntil: this.timeOutUntil ? this.timeOutUntil.toISOString() : null,
      depositLimit: this.depositLimit
        ? { amountCents: this.depositLimit.amountCents, period: this.depositLimit.period }
        : null,
      depositPeriodStart: this.depositPeriodStart.toISOString(),
      depositUsedCents: this.depositUsedCents,
      betLimit: this.betLimit
        ? { amountCents: this.betLimit.amountCents, period: this.betLimit.period }
        : null,
      betPeriodStart: this.betPeriodStart.toISOString(),
      betUsedCents: this.betUsedCents,
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  private throwInvalidDate(): never {
    throw new DomainError({
      code: 'RESPONSIBLE_GAMBLING_INVALID_DATE',
      message: 'A data deve estar no futuro',
    });
  }

  private refreshDepositUsage(now: Date): void {
    if (
      this.depositLimit &&
      periodElapsed(this.depositPeriodStart, this.depositLimit.period, now)
    ) {
      this.depositPeriodStart = now;
      this.depositUsedCents = 0;
    }
  }

  private refreshBetUsage(now: Date): void {
    if (this.betLimit && periodElapsed(this.betPeriodStart, this.betLimit.period, now)) {
      this.betPeriodStart = now;
      this.betUsedCents = 0;
    }
  }
}

const periodElapsed = (start: Date, period: ResponsibleGamblingPeriod, now: Date): boolean => {
  if (period === 'DAY') {
    const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return nowUtc > startUtc;
  }
  const elapsedMs = now.getTime() - start.getTime();
  const windowMs = period === 'WEEK' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return elapsedMs >= windowMs;
};