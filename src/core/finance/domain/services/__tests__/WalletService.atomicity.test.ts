import { WalletService } from '../WalletService';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { ILedgerRepository } from '@/core/finance/domain/repositories/ILedgerRepository';
import { LedgerEntry } from '@/core/finance/domain/entities/LedgerEntry';
import { AppError } from '@/shared/errors/AppError';

function baseWalletRepoMock(wallet: Wallet) {
  return {
    findByUserId: jest.fn().mockResolvedValue(wallet),
    save: jest.fn().mockImplementation((w: Wallet) => Promise.resolve(w)),
    update: jest.fn().mockImplementation((w: Wallet) => Promise.resolve(w)),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

function baseLedgerMock() {
  const ledger = {
    append: jest.fn().mockImplementation((entry: LedgerEntry) => Promise.resolve(entry)),
    exists: jest.fn().mockResolvedValue(false),
    findByUserId: jest.fn().mockResolvedValue([]),
    countByUserId: jest.fn().mockResolvedValue(0),
    sumByTypes: jest.fn().mockResolvedValue({ amountCents: 0, count: 0 }),
    aggregateByTypes: jest.fn().mockResolvedValue({ amountCents: 0, count: 0 }),
  };
  return ledger as jest.Mocked<ILedgerRepository>;
}

describe('WalletService — atomicidade Wallet + Ledger', () => {
  it('Com withTransaction disponível, wallet e ledger rodam na MESMA sessão', async () => {
    const wallet = new Wallet('u-tx', 'BRL');
    const repo = {
      ...baseWalletRepoMock(wallet),
      withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => work({ id: 's-tx' })),
    };
    const ledger = baseLedgerMock();
    const service = new WalletService(repo as never, ledger as never);

    await service.deposit('u-tx', 100, { type: 'DEPOSIT', referenceId: 'ref-1', source: 'CREDIT_PACKAGE' });

    expect(repo.withTransaction).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-tx' }),
      expect.objectContaining({ session: { id: 's-tx' } }),
    );
    expect(ledger.append).toHaveBeenCalledWith(
      expect.any(LedgerEntry),
      expect.objectContaining({ session: { id: 's-tx' } }),
    );
    expect(wallet.balance).toBe(100);
  });

  it('Falha do Ledger NÃO é engolida: depósito rejeita (dentro da transação isso reverte a Wallet)', async () => {
    const wallet = new Wallet('u-fail', 'BRL');
    const repo = {
      ...baseWalletRepoMock(wallet),
      withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => work({ id: 's-fail' })),
    };
    const ledger = baseLedgerMock();
    ledger.append.mockRejectedValue(new Error('ledger insert failed (simulated)'));
    const service = new WalletService(repo as never, ledger as never);

    await expect(
      service.deposit('u-fail', 50, { type: 'DEPOSIT', referenceId: 'ref-2', source: 'CREDIT_PACKAGE' }),
    ).rejects.toThrow('ledger insert failed (simulated)');

    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(ledger.append).toHaveBeenCalled();
  });

  it('Sem withTransaction, a falha do Ledger também rejeita a operação (não é apenas logada)', async () => {
    const wallet = new Wallet('u-nontx', 'BRL');
    const repo = baseWalletRepoMock(wallet);
    const ledger = baseLedgerMock();
    ledger.append.mockRejectedValue(new Error('ledger insert failed (simulated)'));
    const service = new WalletService(repo as never, ledger as never);

    await expect(
      service.deposit('u-nontx', 10, { type: 'DEPOSIT', referenceId: 'ref-3', source: 'CREDIT_PACKAGE' }),
    ).rejects.toThrow('ledger insert failed (simulated)');

    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(ledger.append).toHaveBeenCalled();
  });

  it('CONFLICT transitório na transação: re-executa a unidade inteira e a operação conclui', async () => {
    const wallet = new Wallet('u-retry-ok', 'BRL');
    let attempts = 0;
    const repo = {
      ...baseWalletRepoMock(wallet),
      withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => {
        attempts += 1;
        if (attempts === 1) throw new AppError('CONFLICT', 'conflito transitório (simulado)', 409);
        return work({ id: 's-retry' });
      }),
    };
    const ledger = baseLedgerMock();
    const service = new WalletService(repo as never, ledger as never);

    await service.deposit('u-retry-ok', 100, { type: 'DEPOSIT', referenceId: 'ref-r1', source: 'CREDIT_PACKAGE' });

    expect(repo.withTransaction).toHaveBeenCalledTimes(2);
    expect(ledger.append).toHaveBeenCalledTimes(1);
    expect(wallet.balance).toBe(100);
  });

  it('CONFLICT persistente esgota as tentativas e rejeita a operação sem gravar o ledger', async () => {
    const wallet = new Wallet('u-retry-fail', 'BRL');
    const repo = {
      ...baseWalletRepoMock(wallet),
      withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => {
        throw new AppError('CONFLICT', 'conflito persistente (simulado)', 409);
      }),
    };
    const ledger = baseLedgerMock();
    const service = new WalletService(repo as never, ledger as never);

    await expect(
      service.deposit('u-retry-fail', 50, { type: 'DEPOSIT', referenceId: 'ref-r2', source: 'CREDIT_PACKAGE' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });

    expect(repo.withTransaction).toHaveBeenCalledTimes(25);
    expect(ledger.append).not.toHaveBeenCalled();
  }, 30_000);

  it('MongoServerError 112 (write conflict) transitório: re-executa e conclui', async () => {
    const wallet = new Wallet('u-m112-ok', 'BRL');
    let attempts = 0;
    const writeConflict = () =>
      Object.assign(new Error('Write conflict during plan execution and yielding is disabled. Please retry your operation or multi-document transaction.'), {
        name: 'MongoServerError',
        code: 112,
      });
    const repo = {
      ...baseWalletRepoMock(wallet),
      withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => {
        attempts += 1;
        if (attempts === 1) throw writeConflict();
        return work({ id: 's-m112' });
      }),
    };
    const ledger = baseLedgerMock();
    const service = new WalletService(repo as never, ledger as never);

    await service.deposit('u-m112-ok', 100, { type: 'DEPOSIT', referenceId: 'ref-r3', source: 'CREDIT_PACKAGE' });

    expect(repo.withTransaction).toHaveBeenCalledTimes(2);
    expect(ledger.append).toHaveBeenCalledTimes(1);
    expect(wallet.balance).toBe(100);
  });

  it('MongoServerError 112 persistente esgota as tentativas e rejeita sem gravar o ledger', async () => {
    const wallet = new Wallet('u-m112-fail', 'BRL');
    const writeConflict = () =>
      Object.assign(new Error('Write conflict during plan execution and yielding is disabled.'), {
        name: 'MongoServerError',
        code: 112,
      });
    const repo = {
      ...baseWalletRepoMock(wallet),
      withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => {
        throw writeConflict();
      }),
    };
    const ledger = baseLedgerMock();
    const service = new WalletService(repo as never, ledger as never);

    await expect(service.deposit('u-m112-fail', 50)).rejects.toMatchObject({
      name: 'MongoServerError',
      code: 112,
    });

    expect(repo.withTransaction).toHaveBeenCalledTimes(25);
    expect(ledger.append).not.toHaveBeenCalled();
  }, 30_000);

  it('MongoServerError NÃO transitório (ex. duplicate key) não é re-tentado', async () => {
    const wallet = new Wallet('u-m11000', 'BRL');
    const repo = {
      ...baseWalletRepoMock(wallet),
      withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => {
        throw Object.assign(new Error('E11000 duplicate key error'), { name: 'MongoServerError', code: 11000 });
      }),
    };
    const ledger = baseLedgerMock();
    const service = new WalletService(repo as never, ledger as never);

    await expect(service.deposit('u-m11000', 10)).rejects.toMatchObject({
      name: 'MongoServerError',
      code: 11000,
    });

    expect(repo.withTransaction).toHaveBeenCalledTimes(1);
    expect(ledger.append).not.toHaveBeenCalled();
  });

  it('NÃO re-tenta erros que não são CONFLICT (propaga imediatamente)', async () => {
    const wallet = new Wallet('u-retry-other', 'BRL');
    const repo = {
      ...baseWalletRepoMock(wallet),
      withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => {
        throw new AppError('INTERNAL_SERVER_ERROR', 'erro não transitório (simulado)', 500);
      }),
    };
    const ledger = baseLedgerMock();
    const service = new WalletService(repo as never, ledger as never);

    await expect(service.deposit('u-retry-other', 10)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      statusCode: 500,
    });
    expect(repo.withTransaction).toHaveBeenCalledTimes(1);
    expect(ledger.append).not.toHaveBeenCalled();
  });

  it('withdraw/lock/withdrawLocked também passam a sessão de transação para wallet e ledger', async () => {
    const wallet = new Wallet('u-multi', 'BRL');
    const repo = {
      ...baseWalletRepoMock(wallet),
      withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => work({ id: 's-multi' })),
    };
    const ledger = baseLedgerMock();
    const service = new WalletService(repo as never, ledger as never);

    await service.deposit('u-multi', 200);
    await service.lock('u-multi', 60, { type: 'WITHDRAWAL_HOLD', referenceId: 'wd-1', source: 'WITHDRAWAL' });
    await service.withdrawLocked('u-multi', 60, { type: 'WITHDRAWAL_COMPLETED', referenceId: 'wd-1', source: 'WITHDRAWAL' });

    expect(ledger.append).toHaveBeenCalledTimes(3);
    const sessions = ledger.append.mock.calls.map(([, opts]) => opts?.session as { id?: string } | undefined);
    expect(sessions).toHaveLength(3);
    expect(sessions.every((s) => s?.id === 's-multi')).toBe(true);
    expect(repo.update).toHaveBeenCalledTimes(3);
  });
});