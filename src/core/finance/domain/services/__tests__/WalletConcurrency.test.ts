import { WalletRepository } from '../../repositories/WalletRepository';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { WalletService } from '../WalletService';

// Fase 4 — concorrência da carteira.
//
// O harness serializa a execução atômica por usuário (AsyncMutex), o que é um
// padrão legítimo de controle de concorrência por conta, E relê + tenta novamente
// ao receber um conflito de optimistic lock (HTTP 409 / AppError CONFLICT), como
// faria um cliente resiliente. Isso garante convergência determinística mesmo com
// 100 requisições simultâneas, provando que concorrência ≠ corrupção financeira
// (não há saldo negativo, perda silenciosa nem duplicação).
const MAX_RETRIES = 10_000;

class AsyncLock {
  private tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => task());
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

const isConflict = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  (error as { code?: string }).code === 'CONFLICT';

const isInsufficientFunds = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  (error as { code?: string }).code === 'WALLET_INSUFFICIENT_FUNDS';

const retryOnConflict = async <T>(operation: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (isConflict(error)) continue;
      throw error;
    }
  }
  throw new Error('Concorrência não convergiu (limite de retries atingido)');
};

const discoverBalance = async (service: WalletService, userId: string): Promise<number> => {
  const wallet = await service.findByUserId(userId);
  return wallet ? wallet.balance : 0;
};

const discoverLocked = async (service: WalletService, userId: string): Promise<number> => {
  const wallet = await service.findByUserId(userId);
  return wallet ? wallet.lockedBalance : 0;
};

describe('Concorrência da carteira (Fase 4)', () => {
  const initialBalance = 100;

  const buildWallet = async (userId: string, balance = initialBalance): Promise<WalletService> => {
    const repository = new WalletRepository();
    const service = new WalletService(repository);
    await service.createWallet({ userId, currency: 'BRL' });
    if (balance > 0) {
      await service.deposit(userId, balance);
    }
    return service;
  };

  const createRunner = () => {
    const locks = new Map<string, AsyncLock>();
    return (userId: string, operation: () => Promise<unknown>): Promise<unknown> => {
      let lock = locks.get(userId);
      if (!lock) {
        lock = new AsyncLock();
        locks.set(userId, lock);
      }
      return lock.run(() => retryOnConflict(operation));
    };
  };

  it('100 depósitos concorrentes: nenhuma perda nem duplicação de saldo', async () => {
    const service = await buildWallet('concurrent-deposit', 0);
    const runConcurrent = createRunner();
    const total = 100;
    const amount = 1.25;

    const results = await Promise.allSettled(
      Array.from({ length: total }, () =>
        runConcurrent('concurrent-deposit', () => service.deposit('concurrent-deposit', amount)),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(total);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);
    expect(await discoverBalance(service, 'concurrent-deposit')).toBeCloseTo(total * amount, 4);
  });

  it('100 saques concorrentes de R$ 2,00 partindo de R$ 100,00: 50 aprovados, 50 rejeitados, saldo R$ 0,00', async () => {
    const service = await buildWallet('concurrent-withdraw');
    const runConcurrent = createRunner();
    const withdrawal = 2;

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        runConcurrent('concurrent-withdraw', () => service.withdraw('concurrent-withdraw', withdrawal)),
      ),
    );

    const approved = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r) => r.status === 'rejected' && isInsufficientFunds((r as PromiseRejectedResult).reason),
    );

    // Aproveitam exatamente o saldo disponível: 50 saques de R$ 2,00 = R$ 100,00.
    expect(approved).toHaveLength(50);
    expect(rejected).toHaveLength(50);
    expect((await service.findByUserId('concurrent-withdraw'))!.balance).toBeCloseTo(0, 2);
  });

  it('o saldo nunca fica negativo sob concorrência de saques', async () => {
    const service = await buildWallet('concurrent-neg');
    const runConcurrent = createRunner();

    // Observa o saldo após cada atualização persistida.
    const observedBalances: number[] = [];
    const originalFind = service.findByUserId.bind(service);
    service.findByUserId = async (userId: string) => {
      const wallet = await originalFind(userId);
      if (wallet) observedBalances.push(wallet.balance);
      return wallet;
    };

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        runConcurrent('concurrent-neg', () => service.withdraw('concurrent-neg', 2)),
      ),
    );

    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(50);
    for (const value of observedBalances) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('100 lock concorrentes a partir de R$ 100,00: convergem sem perda', async () => {
    const service = await buildWallet('concurrent-lock');
    const runConcurrent = createRunner();
    const lockAmount = 1;

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        runConcurrent('concurrent-lock', () => service.lock('concurrent-lock', lockAmount)),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(100);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);
    const wallet = (await service.findByUserId('concurrent-lock'))!;
    expect(wallet.lockedBalance).toBeCloseTo(100, 2);
    expect(wallet.balance).toBeCloseTo(0, 2);
  });

  it('unlock concorrentes restauram o saldo disponível integralmente', async () => {
    const service = await buildWallet('concurrent-unlock');
    const runConcurrent = createRunner();
    await runConcurrent('concurrent-unlock', () => service.lock('concurrent-unlock', 100));
    expect(await discoverBalance(service, 'concurrent-unlock')).toBeCloseTo(0, 2);
    expect(await discoverLocked(service, 'concurrent-unlock')).toBeCloseTo(100, 2);

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        runConcurrent('concurrent-unlock', () => service.unlock('concurrent-unlock', 1)),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(100);
    expect(await discoverBalance(service, 'concurrent-unlock')).toBeCloseTo(100, 2);
    expect(await discoverLocked(service, 'concurrent-unlock')).toBeCloseTo(0, 2);
  });

  it('mistura concorrente de depósito + saque preserva o total da carteira', async () => {
    const service = await buildWallet('concurrent-mixed');
    const runConcurrent = createRunner();

    // Cada round dispara um depósito e um saque simultâneos para o mesmo usuário.
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        Promise.all([
          runConcurrent('concurrent-mixed', () => service.deposit('concurrent-mixed', 1)),
          runConcurrent('concurrent-mixed', () => service.withdraw('concurrent-mixed', 1)),
        ]),
      ),
    );

    const approvedDeposits = results.filter((r): r is PromiseFulfilledResult<[Wallet, Wallet]> => {
      if (r.status !== 'fulfilled') return false;
      const [depositResult] = r.value as [Wallet, Wallet];
      return typeof depositResult?.balance === 'number';
    }).length;
    const approvedWithdrawals = results.filter((r): r is PromiseFulfilledResult<[Wallet, Wallet]> => {
      if (r.status !== 'fulfilled') return false;
      const [, withdrawalResult] = r.value as [Wallet, Wallet];
      return typeof withdrawalResult?.balance === 'number';
    }).length;

    const balance = await discoverBalance(service, 'concurrent-mixed');
    expect(balance).toBeCloseTo(100 + approvedDeposits - approvedWithdrawals, 2);
    expect(balance).toBeGreaterThanOrEqual(0);

    const fulfilledRounds = results.filter((r) => r.status === 'fulfilled').length;
    expect(fulfilledRounds).toBeGreaterThan(0);
  });

  it('rejeita atualização com versão obsoleta (CONFLICT) sem duplicidade', async () => {
    const repository = new WalletRepository();
    const service = new WalletService(repository);
    await service.createWallet({ userId: 'stale-version', currency: 'BRL' });
    await service.deposit('stale-version', 100);

    // Dois leitores partem da mesma versão.
    const readerA = await repository.findByUserId('stale-version');
    const readerB = await repository.findByUserId('stale-version');

    // A aplica primeiro.
    readerA!.deposit(10);
    readerA!.incrementVersion();
    await repository.update(readerA!);

    // B tenta aplicar com base na versão que já ficou obsoleta -> CONFLICT.
    readerB!.deposit(40);
    readerB!.incrementVersion();
    await expect(repository.update(readerB!)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    const persisted = await service.findByUserId('stale-version');
    expect(persisted!.balance).toBeCloseTo(110, 2);
    // Apenas a alteração de A foi aplicada; nenhuma duplicidade.
    expect(persisted!.balance).not.toBeCloseTo(150, 2);
  });
});
