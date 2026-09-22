import {
  compareReconciliations,
  describeSummary,
  RawLedgerRepository,
  RawWalletRepository,
  reconcileDbFinance,
} from '@/infrastructure/backup/financeReconciliation';
import { ReconciliationSummary, UserReconciliationResult } from '@/core/finance/application/services/FinancialReconciliationService';
import { ObjectId } from 'mongodb';

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

describe('financeReconciliation adapters — leitura via mongo raw', () => {
  const walletDb = (doc: unknown) =>
    ({
      collection: jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(doc) })),
    }) as never;

  it('RawWalletRepository devolve null quando não há carteira', async () => {
    const repo = new RawWalletRepository(walletDb(null));
    await expect(repo.findByUserId('u-sem-carteira')).resolves.toBeNull();
  });

  it('RawWalletRepository monta a Wallet com balance/locked/version do doc', async () => {
    const repo = new RawWalletRepository(
      walletDb({
        _id: 'w1',
        userId: 'u1',
        balanceCents: 1234,
        lockedBalanceCents: 56,
        currency: 'BRL',
        version: 7,
      }),
    );
    const wallet = await repo.findByUserId('u1');
    expect(wallet?.balance).toBe(12.34);
    expect(wallet?.lockedBalance).toBe(0.56);
    expect((wallet as any)._version).toBe(7);
  });

  it('RawWalletRepository usa version default 1 quando ausente', async () => {
    const repo = new RawWalletRepository(
      walletDb({ _id: 'w1', userId: 'u1', balanceCents: 100, lockedBalanceCents: 0, currency: 'BRL' }),
    );
    const wallet = await repo.findByUserId('u1');
    expect((wallet as any)._version).toBe(1);
  });

  const sumDb = (rows: unknown[]) => {
    const aggregate = jest.fn(() => ({ toArray: jest.fn().mockResolvedValue(rows) }));
    return { aggregate, db: { collection: jest.fn(() => ({ aggregate })) } as never };
  };

  it('sumByTypes soma e conta quando há linhas', async () => {
    const { db } = sumDb([{ amountCents: 300, count: 2 }]);
    const repo = new RawLedgerRepository(db);
    await expect(repo.sumByTypes('u1', ['DEPOSIT', 'BET_PLACED'] as any)).resolves.toEqual({
      amountCents: 300,
      count: 2,
    });
  });

  it('sumByTypes sem linhas devolve zero', async () => {
    const { db } = sumDb([]);
    const repo = new RawLedgerRepository(db);
    await expect(repo.sumByTypes('u1', ['DEPOSIT'] as any)).resolves.toEqual({
      amountCents: 0,
      count: 0,
    });
  });

  it('sumByTypes com amountCents nulo normaliza para 0', async () => {
    const { db } = sumDb([{ amountCents: null, count: 0 }]);
    const repo = new RawLedgerRepository(db);
    await expect(repo.sumByTypes('u1', ['DEPOSIT'] as any)).resolves.toEqual({
      amountCents: 0,
      count: 0,
    });
  });

  it('sumTypeGroup propaga from e statuses para o $match', async () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const { aggregate, db } = sumDb([{ amountCents: 1, count: 1 }]);
    const repo = new RawLedgerRepository(db);
    await repo.sumByTypes('u1', ['DEPOSIT'] as any, { from, statuses: ['COMPLETED'] });

    expect(aggregate).toHaveBeenCalledWith([
      {
        $match: {
          userId: 'u1',
          type: { $in: ['DEPOSIT'] },
          createdAt: { $gte: from },
          status: { $in: ['COMPLETED'] },
        },
      },
      expect.anything(),
    ]);
  });

  it('countByUserId conta documentos do ledger', async () => {
    const countDocuments = jest.fn().mockResolvedValue(5);
    const repo = new RawLedgerRepository({ collection: jest.fn(() => ({ countDocuments })) } as never);
    await expect(repo.countByUserId('u1')).resolves.toBe(5);
  });

  it('RawLedgerRepository rejeita findByUserId e aggregateByTypes', async () => {
    const repo = new RawLedgerRepository({} as never);
    await expect(repo.findByUserId('u1')).rejects.toThrow('não é usada pela reconciliação');
    await expect(repo.aggregateByTypes()).rejects.toThrow('não é usada pela reconciliação');
  });
});

describe('financeReconciliation — casos de borda de compareReconciliations', () => {
  it('reconciliações com currency ausente são iguais (assinatura normaliza vazio)', () => {
    const a = summary([userResult({ userId: 'u1', currency: undefined as never, entries: 3 })]);
    const b = summary([userResult({ userId: 'u1', currency: undefined as never, entries: 3 })]);
    const comparison = compareReconciliations(a, b);
    expect(comparison.equal).toBe(true);
    expect(comparison.diffs).toHaveLength(0);
  });

  it('lista divergência por usuário', () => {
    const a = summary([userResult({ userId: 'u1', balanceCents: 100 })]);
    const b = summary([userResult({ userId: 'u1', balanceCents: 99 })]);
    const comparison = compareReconciliations(a, b);
    expect(comparison.diffs.some((d) => d.includes('divergência em "u1"'))).toBe(true);
  });

  it('ambos vazios são iguais e passam', () => {
    const comparison = compareReconciliations(summary([]), summary([]));
    expect(comparison).toEqual({ equal: true, sourcePassed: true, restoredPassed: true, diffs: [] });
  });
});

describe('financeReconciliation describeSummary', () => {
  it('imprime o resumo no console', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    describeSummary('origem', summary([userResult({ userId: 'u1' })]) as ReconciliationSummary);
    expect(log).toHaveBeenCalledWith('origem: 1 usuário(s), 1 ok, 0 falhas');
    log.mockRestore();
  });
});

describe('financeReconciliation reconcileDbFinance (mongo raw fake)', () => {
  function fakeDb(users: { _id: unknown }[], wallets: Record<string, unknown>, ledgerRows: unknown[]) {
    const collections: Record<string, any> = {
      users: {
        find: jest.fn(() => ({ toArray: jest.fn().mockResolvedValue(users) })),
      },
      wallets: {
        findOne: jest.fn((query: { userId: string }) => Promise.resolve(wallets[query.userId] ?? null)),
      },
      ledgerentries: {
        aggregate: jest.fn(() => ({ toArray: jest.fn().mockResolvedValue(ledgerRows) })),
      },
    };
    return {
      collection: (name: string) => collections[name] ?? collections.ledgerentries,
      _collections: collections,
    } as any;
  }

  it('normaliza _id ObjectId e string e reconcilia todos os usuários', async () => {
    const idObject = new ObjectId();
    const db = fakeDb(
      [{ _id: idObject }, { _id: 'plain-user' }],
      {
        [idObject.toHexString()]: {
          _id: idObject,
          userId: idObject.toHexString(),
          balanceCents: 0,
          lockedBalanceCents: 0,
          currency: 'BRL',
          version: 1,
        },
      },
      [],
    );

    const result = await reconcileDbFinance(db);

    expect(db._collections.users.find).toHaveBeenCalledWith({}, { projection: { _id: 1 } });
    expect(result.checked).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results[0].userId).toBe(idObject.toHexString());
    expect(result.results[0].missingWallet).toBe(false);
    expect(result.results[0].balancePassed).toBe(true);
    expect(result.results[1].userId).toBe('plain-user');
    expect(result.results[1].missingWallet).toBe(true);
  });

  it('marca usuários com entradas de ledger mas sem carteira como falha', async () => {
    const db = fakeDb([{ _id: 'u-sem-carteira' }], {}, [{ amountCents: 10, count: 1 }]);

    const result = await reconcileDbFinance(db);

    expect(result.checked).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0].passed).toBe(false);
    expect(result.results[0].missingWallet).toBe(true);
    expect(result.results[0].entries).toBeGreaterThan(0);
  });
});