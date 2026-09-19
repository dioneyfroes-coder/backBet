import {
  compareReconciliations,
  RawLedgerRepository,
  RawWalletRepository,
} from '@/infrastructure/backup/financeReconciliation';
import { ReconciliationSummary, UserReconciliationResult } from '@/core/finance/application/services/FinancialReconciliationService';

function userResult(partial: Partial<UserReconciliationResult> & { userId: string }): UserReconciliationResult {
  return {
    missingWallet: false,
    currency: 'BRL',
    balanceCents: 0,
    lockedBalanceCents: 0,
    ledgerBalanceCents: 0,
    ledgerLockedCents: 0,
    entries: 0,
    balanceDiffCents: 0,
    lockedDiffCents: 0,
    balancePassed: true,
    lockedPassed: true,
    passed: true,
    ...partial,
  };
}

function summary(results: UserReconciliationResult[]): ReconciliationSummary {
  return {
    checked: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}

describe('financeReconciliation compareReconciliations', () => {
  it('reconciliações idênticas (mesmo conjunto, ordem diferente) são iguais', () => {
    const a = summary([
      userResult({ userId: 'u1', balanceCents: 100 }),
      userResult({ userId: 'u2', balanceCents: 50 }),
    ]);
    const b = summary([
      userResult({ userId: 'u2', balanceCents: 50 }),
      userResult({ userId: 'u1', balanceCents: 100 }),
    ]);
    const comparison = compareReconciliations(a, b);
    expect(comparison.equal).toBe(true);
    expect(comparison.diffs).toHaveLength(0);
    expect(comparison.sourcePassed).toBe(true);
    expect(comparison.restoredPassed).toBe(true);
  });

  it('detecta divergência de saldo por usuário', () => {
    const a = summary([userResult({ userId: 'u1', balanceCents: 100 })]);
    const b = summary([userResult({ userId: 'u1', balanceCents: 99 })]);
    const comparison = compareReconciliations(a, b);
    expect(comparison.equal).toBe(false);
    expect(comparison.diffs.some((d) => d.includes('u1'))).toBe(true);
  });

  it('detecta usuário ausente no ambiente restaurado', () => {
    const a = summary([userResult({ userId: 'u1' }), userResult({ userId: 'u2' })]);
    const b = summary([userResult({ userId: 'u1' })]);
    const comparison = compareReconciliations(a, b);
    expect(comparison.equal).toBe(false);
    expect(comparison.diffs.some((d) => d.includes('ausente no restaurado'))).toBe(true);
  });

  it('detecta usuário excedente no ambiente restaurado', () => {
    const a = summary([userResult({ userId: 'u1' })]);
    const b = summary([userResult({ userId: 'u1' }), userResult({ userId: 'u3' })]);
    const comparison = compareReconciliations(a, b);
    expect(comparison.equal).toBe(false);
    expect(comparison.diffs.some((d) => d.includes('excedente no restaurado'))).toBe(true);
  });

  it('sinaliza ambiente de origem com falha financeira', () => {
    const a = summary([userResult({ userId: 'u1', passed: false })]);
    const b = summary([userResult({ userId: 'u1', passed: false })]);
    const comparison = compareReconciliations(a, b);
    expect(comparison.equal).toBe(true);
    expect(comparison.sourcePassed).toBe(false);
    expect(comparison.restoredPassed).toBe(false);
  });
});

describe('financeReconciliation adapters somente-leitura', () => {
  const stubDb = {} as never;

  it('RawWalletRepository rejeita escrita (save/update/delete)', async () => {
    const repo = new RawWalletRepository(stubDb);
    await expect(repo.save({} as never, undefined)).rejects.toThrow('não é usada pela reconciliação');
    await expect(repo.update({} as never)).rejects.toThrow('não é usada pela reconciliação');
    await expect(repo.delete('u1')).rejects.toThrow('não é usada pela reconciliação');
  });

  it('RawLedgerRepository rejeita escrita (append/exists)', async () => {
    const repo = new RawLedgerRepository(stubDb);
    await expect(repo.append({} as never)).rejects.toThrow('não é usada pela reconciliação');
    await expect(repo.exists('tx')).rejects.toThrow('não é usada pela reconciliação');
  });
});