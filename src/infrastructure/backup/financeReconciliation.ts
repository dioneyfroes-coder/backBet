import { Db, ObjectId } from 'mongodb';
import { IWalletRepository, WalletRepositoryOptions } from '@/core/finance/domain/repositories/IWalletRepository';
import { ILedgerRepository, LedgerRepositoryOptions, LedgerSumOptions } from '@/core/finance/domain/repositories/ILedgerRepository';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { LedgerOperationType } from '@/core/finance/domain/entities/LedgerEntry';
import { FinancialReconciliationService, ReconciliationSummary, UserReconciliationResult } from '@/core/finance/application/services/FinancialReconciliationService';

/**
 * Reconciliador financeiro sobre o MongoDB RAW (collection-a-collection) usado
 * pela Fase 15 (backup/DR). Permite rodar o FinancialReconciliationService
 * contra QUALQUER database (origem e restaurado) sem passar pelo mongoose —
 * que ficaria preso ao database da conexão padrão.
 */
export const FINANCE_COLLECTIONS = {
  users: 'users',
  wallets: 'wallets',
  ledgerEntries: 'ledgerentries',
  bets: 'bets',
  withdrawalRequests: 'withdrawalrequests',
} as const;

type RawWalletDoc = {
  _id: unknown;
  userId: string;
  version?: number;
  balanceCents: number;
  lockedBalanceCents: number;
  currency: string;
};

type WalletInternals = {
  _balance: Money;
  _lockedBalance: Money;
  _version: number;
};

class UnsupportedReconciliationOp extends Error {
  constructor(operation: string) {
    super(`Operação "${operation}" não é usada pela reconciliação (somente leitura).`);
    this.name = 'UnsupportedReconciliationOp';
  }
}

/** IWalletRepository somente-leitura: findByUserId via mongo raw. */
export class RawWalletRepository implements IWalletRepository {
  constructor(private readonly db: Db) {}

  async findByUserId(
    userId: string,
    _options?: WalletRepositoryOptions,
  ): Promise<Wallet | null> {
    const doc = (await this.db
      .collection(FINANCE_COLLECTIONS.wallets)
      .findOne({ userId })) as unknown as RawWalletDoc | null;
    if (!doc) {
      return null;
    }
    const wallet = new Wallet(doc.userId, doc.currency as Wallet['currency']);
    const mutable = wallet as unknown as WalletInternals;
    mutable._balance = Money.fromCents(doc.balanceCents, doc.currency as Wallet['currency']);
    mutable._lockedBalance = Money.fromCents(
      doc.lockedBalanceCents,
      doc.currency as Wallet['currency'],
    );
    mutable._version = doc.version ?? 1;
    return wallet;
  }

  async save(_wallet: Wallet, _options?: WalletRepositoryOptions): Promise<Wallet> {
    throw new UnsupportedReconciliationOp('save');
  }

  async update(_wallet: Wallet, _options?: WalletRepositoryOptions): Promise<Wallet> {
    throw new UnsupportedReconciliationOp('update');
  }

  async delete(_userId: string): Promise<void> {
    throw new UnsupportedReconciliationOp('delete');
  }

  async getHistory(
    _userId: string,
    _limit?: number,
    _offset?: number,
  ): Promise<{ transactions: import('@/core/finance/domain/entities/Transaction').ITransactionDTO[]; total: number }> {
    throw new UnsupportedReconciliationOp('getHistory');
  }
}

/** ILedgerRepository somente-leitura: sumByTypes/countByUserId via mongo raw. */
export class RawLedgerRepository implements ILedgerRepository {
  constructor(private readonly db: Db) {}

  private sumTypeGroup(
    userId: string,
    types: LedgerOperationType[],
    options?: LedgerSumOptions,
  ): Record<string, unknown> {
    const match: Record<string, unknown> = { userId, type: { $in: types } };
    if (options?.from) {
      match.createdAt = { $gte: options.from };
    }
    if (options?.statuses) {
      match.status = { $in: options.statuses };
    }
    return match;
  }

  async sumByTypes(
    userId: string,
    types: LedgerOperationType[],
    options?: LedgerSumOptions,
  ): Promise<{ amountCents: number; count: number }> {
    const rows = await this.db
      .collection(FINANCE_COLLECTIONS.ledgerEntries)
      .aggregate<{ amountCents: number; count: number }>([
        { $match: this.sumTypeGroup(userId, types, options) },
        {
          $group: {
            _id: null,
            amountCents: { $sum: '$amountCents' },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();
    if (rows.length === 0) {
      return { amountCents: 0, count: 0 };
    }
    return { amountCents: rows[0].amountCents ?? 0, count: rows[0].count ?? 0 };
  }

  async countByUserId(userId: string): Promise<number> {
    return this.db.collection(FINANCE_COLLECTIONS.ledgerEntries).countDocuments({ userId });
  }

  async append(
    _entry: import('@/core/finance/domain/entities/LedgerEntry').LedgerEntry,
    _options?: LedgerRepositoryOptions,
  ): Promise<import('@/core/finance/domain/entities/LedgerEntry').LedgerEntry> {
    throw new UnsupportedReconciliationOp('append');
  }

  async exists(_transactionId: string, _options?: LedgerRepositoryOptions): Promise<boolean> {
    throw new UnsupportedReconciliationOp('exists');
  }

  async findByUserId(
    _userId: string,
    _options?: { limit?: number; offset?: number },
  ): Promise<import('@/core/finance/domain/entities/LedgerEntry').LedgerEntry[]> {
    throw new UnsupportedReconciliationOp('findByUserId');
  }

  async aggregateByTypes(): Promise<{ amountCents: number; count: number }> {
    throw new UnsupportedReconciliationOp('aggregateByTypes');
  }
}

export function createFinanceReconcilerForDb(db: Db): FinancialReconciliationService {
  return new FinancialReconciliationService(new RawWalletRepository(db), new RawLedgerRepository(db));
}

/**
 * Reconcilia TODO o ambiente dentro de `db`: para cada usuário (users._id)
 * verifica se balance/lockedBalance da carteira são deriváveis do ledger.
 * `ObjectId._id` (nunca usado nos schemas, mas segurado) é normalizado para
 * id string para comparar bancos com tipos de _id diferentes.
 */
export async function reconcileDbFinance(db: Db): Promise<ReconciliationSummary> {
  const userDocs = await db
    .collection(FINANCE_COLLECTIONS.users)
    .find({}, { projection: { _id: 1 } })
    .toArray();
  const userIds = userDocs.map((doc) =>
    doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id),
  );
  return createFinanceReconcilerForDb(db).reconcileUsers(userIds);
}

/** Assinatura canônica de um resultado de reconciliação (ordem-safe). */
function signatureOf(result: UserReconciliationResult): string {
  return [
    result.userId,
    result.missingWallet,
    result.currency ?? '',
    result.balanceCents,
    result.lockedBalanceCents,
    result.ledgerBalanceCents,
    result.ledgerLockedCents,
    result.entries,
    result.passed,
  ].join('|');
}

export type ReconciliationComparison = {
  equal: boolean;
  sourcePassed: boolean;
  restoredPassed: boolean;
  diffs: string[];
};

/**
 * Compara a reconciliação do ambiente ORIGEM com a do RESTAURADO: o conjunto
 * de usuários, os saldos e o veredito devem ser idênticos. `sourcePassed`/
 * `restoredPassed` exigem que AMBOS os ambientes estejam financeiramente
 * consistentes (failed === 0) — o verdadeiro objetivo do DR.
 */
export function compareReconciliations(
  source: ReconciliationSummary,
  restored: ReconciliationSummary,
): ReconciliationComparison {
  const sourceByUser = new Map(source.results.map((r) => [r.userId, r]));
  const restoredByUser = new Map(restored.results.map((r) => [r.userId, r]));
  const diffs: string[] = [];

  const sourceFold = sourcePassedOf(source.results);
  const restoredFold = sourcePassedOf(restored.results);
  const perUserEqual =
    source.results.length === restored.results.length &&
    source.results.every(
      (r) =>
        restoredByUser.has(r.userId) &&
        signatureOf(r) === signatureOf(restoredByUser.get(r.userId)!),
    );

  if (source.results.length !== restored.results.length) {
    diffs.push(
      `usuários diferentes: origem ${source.results.length} vs restaurado ${restored.results.length}`,
    );
  }
  for (const [userId, result] of sourceByUser) {
    if (!restoredByUser.has(userId)) {
      diffs.push(`usuário ausente no restaurado: ${userId}`);
    }
  }
  for (const [userId, result] of restoredByUser) {
    if (!sourceByUser.has(userId)) {
      diffs.push(`usuário excedente no restaurado: ${userId}`);
    }
  }
  if (perUserEqual && diffs.length === 0) {
    return { equal: true, sourcePassed: sourceFold, restoredPassed: restoredFold, diffs: [] };
  }

  for (const [userId, result] of sourceByUser) {
    const restored = restoredByUser.get(userId);
    if (!restored) {
      continue;
    }
    if (signatureOf(result) !== signatureOf(restored)) {
      diffs.push(
        `divergência em "${userId}": origem(${signatureOf(result)}) vs restaurado(${signatureOf(restored)})`,
      );
    }
  }
  return { equal: false, sourcePassed: sourceFold, restoredPassed: restoredFold, diffs };
}

function sourcePassedOf(results: UserReconciliationResult[]): boolean {
  return results.length >= 0 && results.every((r) => r.passed);
}

export function describeSummary(prefix: string, summary: ReconciliationSummary): void {
  console.log(
    `${prefix}: ${summary.checked} usuário(s), ${summary.passed} ok, ${summary.failed} falhas`,
  );
}