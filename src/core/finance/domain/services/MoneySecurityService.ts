import { ILedgerRepository } from '../repositories/ILedgerRepository';
import { IWithdrawalRequestRepository } from '../repositories/IWithdrawalRequestRepository';
import { IUserRepository } from '@/core/user/domain/repositories/IUserRepository';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { appConfig } from '@/shared/config/appConfig';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { moneySecurityBlockedCounter } from '@/infrastructure/observability/metrics';

/**
 * MoneySecurityService — Segurança específica de dinheiro (Fase 13).
 *
 * Aplica regras determinísticas (sem necessidade de ML) sobre operações
 * financeiras de depósito e saque:
 *
 *  - limites independentes por operação e por dia (valor e quantidade);
 *  - detecção de múltiplos saques rápidos (velocidade);
 *  - detecção de mudança de Pix seguida de saque (cooldown);
 *  - detecção de múltiplas contas compartilhando a mesma chave Pix;
 *  - comportamento anômalo determinístico (saque alto de conta recém-criada);
 *  - tentativas repetitivas (saques recusados/cancelados/falhos em janela).
 *
 * Cada bloqueio gera uma métrica (money_security_blocked_total{rule}) e um
 * log estruturado, mantendo a operação auditável em vez de apenas recusada.
 */
export class MoneySecurityService {
  constructor(
    private readonly ledgerRepository: ILedgerRepository,
    private readonly userRepository: IUserRepository,
    private readonly withdrawalRequestRepository?: IWithdrawalRequestRepository,
  ) {}

  async assertDepositAllowed(userId: string, amount: number): Promise<void> {
    const c = appConfig.moneySecurity.limits;

    if (amount > c.maxPerDeposit) {
      this.block('MONEY_SECURITY_DEPOSIT_MAX_AMOUNT', userId, 400, {
        requested: amount,
        limit: c.maxPerDeposit,
        operation: 'DEPOSIT',
      });
    }

    const since = startOfUtcDay();
    const agg = await this.ledgerRepository.sumByTypes(userId, ['DEPOSIT'], {
      from: since,
      statuses: ['COMPLETED'],
    });

    if (agg.amountCents + toCents(amount) > toCents(c.maxDepositPerDay)) {
      this.block('MONEY_SECURITY_DEPOSIT_DAILY_LIMIT', userId, 429, {
        requested: amount,
        todayCents: agg.amountCents,
        limit: c.maxDepositPerDay,
        operation: 'DEPOSIT',
      });
    }

    if (agg.count + 1 > c.maxDepositsPerDay) {
      this.block('MONEY_SECURITY_DEPOSIT_DAILY_COUNT', userId, 429, {
        requestedCount: agg.count + 1,
        limit: c.maxDepositsPerDay,
        operation: 'DEPOSIT',
      });
    }
  }

  async assertWithdrawalAllowed(
    userId: string,
    amount: number,
    pixKey?: string | null,
  ): Promise<void> {
    const c = appConfig.moneySecurity;
    const { limits } = c;

    if (amount > limits.maxPerWithdrawal) {
      this.block('MONEY_SECURITY_WITHDRAWAL_MAX_AMOUNT', userId, 400, {
        requested: amount,
        limit: limits.maxPerWithdrawal,
        operation: 'WITHDRAWAL',
      });
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new DomainError({
        code: 'NOT_FOUND',
        message: 'User not found for money security check',
        details: { userId },
      });
    }

    const effectivePixKey = pixKey?.trim() || user.pixKey?.trim() || null;

    // Comportamento anômalo: saque alto a partir de uma conta recém-criada.
    if (c.anomaly.enabled) {
      const accountAgeMs = Date.now() - user.createdAt.getTime();
      if (accountAgeMs < c.anomaly.minAccountAgeMs && amount > c.anomaly.maxWithdrawalForNewAccount) {
        this.block('MONEY_SECURITY_ACCOUNT_TOO_NEW', userId, 403, {
          requested: amount,
          accountAgeMs,
          accountCreatedAt: user.createdAt.toISOString(),
          operation: 'WITHDRAWAL',
        });
      }
    }

    // Mudança de Pix seguida de saque: cooldown após atualizar a chave.
    if (c.pixChange.enabled && user.pixUpdatedAt && effectivePixKey) {
      const sincePixChangeMs = Date.now() - user.pixUpdatedAt.getTime();
      if (sincePixChangeMs < c.pixChange.cooldownMs) {
        this.block('MONEY_SECURITY_PIX_CHANGED_RECENTLY', userId, 403, {
          pixUpdatedAt: user.pixUpdatedAt.toISOString(),
          cooldownMs: c.pixChange.cooldownMs,
          operation: 'WITHDRAWAL',
        });
      }
    }

    // Múltiplas contas: a mesma chave Pix vinculada a outra conta.
    if (c.multiAccount.enabled && effectivePixKey) {
      const linkedAccounts = await this.userRepository.findByPixKey(effectivePixKey);
      const otherAccounts = linkedAccounts.filter((account) => account.id !== userId);
      if (otherAccounts.length > 0) {
        this.block('MONEY_SECURITY_PIX_KEY_LINKED', userId, 403, {
          pixKey: effectivePixKey,
          linkedAccounts: otherAccounts.map((account) => account.id),
          operation: 'WITHDRAWAL',
        });
      }
    }

    const since = startOfUtcDay();
    const agg = await this.ledgerRepository.sumByTypes(
      userId,
      ['WITHDRAWAL_HOLD', 'WITHDRAWAL_COMPLETED'],
      { from: since, statuses: ['COMPLETED'] },
    );

    if (agg.amountCents + toCents(amount) > toCents(limits.maxWithdrawalPerDay)) {
      this.block('MONEY_SECURITY_WITHDRAWAL_DAILY_LIMIT', userId, 429, {
        requested: amount,
        todayCents: agg.amountCents,
        limit: limits.maxWithdrawalPerDay,
        operation: 'WITHDRAWAL',
      });
    }

    if (agg.count + 1 > limits.maxWithdrawalsPerDay) {
      this.block('MONEY_SECURITY_WITHDRAWAL_DAILY_COUNT', userId, 429, {
        requestedCount: agg.count + 1,
        limit: limits.maxWithdrawalsPerDay,
        operation: 'WITHDRAWAL',
      });
    }

    // Múltiplos saques rápidos: velocidade dentro de janela.
    if (c.velocity.enabled) {
      const velocitySince = new Date(Date.now() - c.velocity.windowMs);
      const velocity = await this.ledgerRepository.sumByTypes(
        userId,
        ['WITHDRAWAL_HOLD', 'WITHDRAWAL_COMPLETED'],
        { from: velocitySince, statuses: ['COMPLETED'] },
      );
      if (velocity.count + 1 > c.velocity.maxWithdrawals) {
        this.block('MONEY_SECURITY_WITHDRAWAL_VELOCITY', userId, 429, {
          requestedCount: velocity.count + 1,
          limit: c.velocity.maxWithdrawals,
          windowMs: c.velocity.windowMs,
          operation: 'WITHDRAWAL',
        });
      }
    }

    // Tentativas repetitivas: saques recusados/cancelados/falhos em janela.
    if (c.failedAttempts.enabled && this.withdrawalRequestRepository) {
      const requests = await this.withdrawalRequestRepository.findByUserId(userId);
      const windowStart = Date.now() - c.failedAttempts.windowMs;
      const failed = requests.filter(
        (r) =>
          (r.status === 'REJECTED' || r.status === 'CANCELED' || r.status === 'FAILED') &&
          r.requestedAt.getTime() >= windowStart,
      );
      if (failed.length + 1 > c.failedAttempts.max) {
        this.block('MONEY_SECURITY_TOO_MANY_FAILED_ATTEMPTS', userId, 429, {
          failedCount: failed.length,
          limit: c.failedAttempts.max,
          windowMs: c.failedAttempts.windowMs,
          operation: 'WITHDRAWAL',
        });
      }
    }
  }

  private block(code: string, userId: string, status: number, details: Record<string, unknown>): never {
    try {
      moneySecurityBlockedCounter.inc({ rule: code });
    } catch (err) {
      console.debug('moneySecurityBlockedCounter inc failed', err);
    }
    writeStructuredLog(
      {
        event: 'money_security_blocked',
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

const toCents = (value: number): number => Math.round(value * 100);

const startOfUtcDay = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};