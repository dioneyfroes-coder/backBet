import { LedgerOperationType } from '@/core/finance/domain/entities/LedgerEntry';
import { IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';
import { ILedgerRepository } from '@/core/finance/domain/repositories/ILedgerRepository';

/**
 * Cardinalidade de cada movimento no SALDO disponível da carteira
 * (+1 = crédito, -1 = débito, 0 = não afeta).
 */
export const BALANCE_EFFECT: Record<LedgerOperationType, number> = {
  DEPOSIT: 1,
  BET_DEBIT: -1,
  BET_REFUND: 1,
  BET_WIN: 1,
  WITHDRAWAL_HOLD: -1,
  WITHDRAWAL_COMPLETED: 0,
  WITHDRAWAL_REVERSED: 1,
  STAKE_LOCK: -1,
  STAKE_RELEASE: 0,
  GAME_WIN: 1,
};

/**
 * Cardinalidade de cada movimento no SALDO TRAVADO (lockedBalance)
 * (+1 = trava, -1 = destrava, 0 = não afeta).
 */
export const LOCKED_EFFECT: Record<LedgerOperationType, number> = {
  DEPOSIT: 0,
  BET_DEBIT: 0,
  BET_REFUND: 0,
  BET_WIN: 0,
  WITHDRAWAL_HOLD: 1,
  WITHDRAWAL_COMPLETED: -1,
  WITHDRAWAL_REVERSED: -1,
  STAKE_LOCK: 1,
  STAKE_RELEASE: -1,
  GAME_WIN: 0,
};

export type UserReconciliationResult = {
  userId: string;
  missingWallet: boolean;
  currency: string | null;
  balanceCents: number;
  lockedBalanceCents: number;
  ledgerBalanceCents: number;
  ledgerLockedCents: number;
  entries: number;
  balanceDiffCents: number;
  lockedDiffCents: number;
  balancePassed: boolean;
  lockedPassed: boolean;
  passed: boolean;
};

export type ReconciliationSummary = {
  checked: number;
  passed: number;
  failed: number;
  results: UserReconciliationResult[];
};

/**
 * Reconciliação financeira por usuário: o saldo da carteira deve ser
 * DERIVÁVEL do ledger (append-only). Para cada usuário calcula o saldo e o
 * travado esperados a partir das somas do ledger (por tipo, com a cardinalidade
 * de BALANCE_EFFECT/LOCKED_EFFECT) e compara com o documento Wallet.
 *
 * Detecta e reporta divergências — nunca corrige silenciosamente. É a
 * verificação usada pela Fase 14 (crash testing) para provar que nenhuma morte
 * do processo deixa uma transação financeira impossível de reconciliar, e será
 * reutilizada na Fase 15 (backup/restore + reconciliação).
 */
export class FinancialReconciliationService {
  constructor(
    private readonly walletRepository: IWalletRepository,
    private readonly ledgerRepository: ILedgerRepository,
  ) {}

  private static readonly TYPES = Object.keys(BALANCE_EFFECT) as LedgerOperationType[];

  async reconcileUser(userId: string): Promise<UserReconciliationResult> {
    const wallet = await this.walletRepository.findByUserId(userId);

    let ledgerBalanceCents = 0;
    let ledgerLockedCents = 0;
    let entries = 0;
    for (const type of FinancialReconciliationService.TYPES) {
      const { amountCents, count } = await this.ledgerRepository.sumByTypes(userId, [type]);
      ledgerBalanceCents += amountCents * BALANCE_EFFECT[type];
      ledgerLockedCents += amountCents * LOCKED_EFFECT[type];
      entries += count;
    }

    if (!wallet) {
      const passed = entries === 0;
      return {
        userId,
        missingWallet: true,
        currency: null,
        balanceCents: 0,
        lockedBalanceCents: 0,
        ledgerBalanceCents,
        ledgerLockedCents,
        entries,
        balanceDiffCents: ledgerBalanceCents,
        lockedDiffCents: ledgerLockedCents,
        balancePassed: ledgerBalanceCents === 0,
        lockedPassed: ledgerLockedCents === 0,
        passed,
      };
    }

    const balanceDiffCents = wallet.balanceCents - ledgerBalanceCents;
    const lockedDiffCents = wallet.lockedBalanceCents - ledgerLockedCents;
    const balancePassed = balanceDiffCents === 0;
    const lockedPassed = lockedDiffCents === 0;

    return {
      userId,
      missingWallet: false,
      currency: wallet.currency,
      balanceCents: wallet.balanceCents,
      lockedBalanceCents: wallet.lockedBalanceCents,
      ledgerBalanceCents,
      ledgerLockedCents,
      entries,
      balanceDiffCents,
      lockedDiffCents,
      balancePassed,
      lockedPassed,
      passed: balancePassed && lockedPassed,
    };
  }

  async reconcileUsers(userIds: string[]): Promise<ReconciliationSummary> {
    const results = await Promise.all(userIds.map((userId) => this.reconcileUser(userId)));
    const passed = results.filter((r) => r.passed).length;
    return {
      checked: results.length,
      passed,
      failed: results.length - passed,
      results,
    };
  }
}