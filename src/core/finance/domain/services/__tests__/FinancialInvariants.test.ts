// Fase 34 — Definir invariantes financeiros.
//
// Suite formal, pura de domínio (repositórios in-memory), que prova que as regras
// financeiras do BackBet NUNCA são violadas — inclusive sob retry e concorrência.
// Referência normativa: docs/FINANCIAL_INVARIANTS.mdx
//
//   FI-01 saldo nunca < 0
//   FI-02 lockedBalance nunca < 0
//   FI-03 exposição nunca < 0
//   FI-04 withdrawal nunca pode pagar duas vezes
//   FI-05 bet nunca pode ser liquidada duas vezes
//   FI-06 transactionId nunca é reutilizado
//   FI-07 idempotency key não muda de operação
//   FI-08 WIN gera exatamente um crédito
//   FI-09 CANCEL gera exatamente um refund
//   FI-10 LOSS não gera prêmio

process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { InMemoryLedgerRepository } from '@/core/finance/domain/repositories/InMemoryLedgerRepository';
import { LedgerEntry } from '@/core/finance/domain/entities/LedgerEntry';
import { BetRepository } from '@/core/betting/domain/repositories/BetRepository';
import { EventRepository } from '@/core/betting/domain/repositories/EventRepository';
import { BetService } from '@/core/betting/domain/services/BetService';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@/core/odds/domain/value-objects/Odds';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { WithdrawalRequest } from '@/core/finance/domain/entities/WithdrawalRequest';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import {
  IdempotencyService,
  InMemoryIdempotencyStore,
} from '@/shared/services/IdempotencyService';

// ---------------------------------------------------------------------------
// Harness compartilhado (respeita o padrão de BetService.critical.test.ts)
// ---------------------------------------------------------------------------

const FOOTBALL_EVENT = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const MARKET_ID = 'mkt-1x2';
const ODD_ID = 'home';

type Harness = {
  walletRepo: WalletRepository;
  ledgerRepo: InMemoryLedgerRepository;
  walletService: WalletService;
  betRepo: BetRepository;
  eventRepo: EventRepository;
};

function createHarness(): Harness {
  const walletRepo = new WalletRepository();
  const ledgerRepo = new InMemoryLedgerRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const betRepo = new BetRepository();
  const eventRepo = new EventRepository();
  return { walletRepo, ledgerRepo, walletService, betRepo, eventRepo };
}

const allowedRisk = {
  canPlaceBet: async () => true,
  reserveExposure: async () => true,
  reserveEventExposure: async () => true,
  reserveMarketExposure: async () => true,
  reduceExposure: async () => undefined,
  reduceEventExposure: async () => undefined,
  reduceMarketExposure: async () => undefined,
} as unknown as RiskService;

function makeBetService(h: Harness): BetService {
  return new BetService(h.betRepo, h.eventRepo, h.walletService, allowedRisk);
}

async function seedWallet(h: Harness, userId: string, balanceCents: number): Promise<void> {
  await h.walletService.createWallet({ userId, currency: 'BRL' });
  if (balanceCents > 0) {
    await h.walletService.deposit(userId, balanceCents / 100, {
      type: 'DEPOSIT',
      referenceId: `seed-${userId}`,
      source: 'DEPOSIT',
    });
  }
}

async function placeBet(h: Harness, userId: string, amount: number): Promise<string> {
  const service = makeBetService(h);
  await service.placeBet({
    userId,
    eventId: FOOTBALL_EVENT,
    marketId: MARKET_ID,
    oddId: ODD_ID,
    amount,
    type: 'SINGLE',
  });
  const bets = await h.betRepo.findByUserId(userId);
  return bets[0].id;
}

async function ledgerEntriesOf(h: Harness, userId: string): Promise<LedgerEntry[]> {
  return h.ledgerRepo.findByUserId(userId, { limit: 1000 });
}

// ---------------------------------------------------------------------------
// Concorrência (mesmo harness do WalletConcurrency, para FI-01)
// ---------------------------------------------------------------------------

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

const createConcurrentRunner = () => {
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

// ---------------------------------------------------------------------------
// FI-01 — saldo nunca < 0
// ---------------------------------------------------------------------------

describe('FI-01 — o saldo nunca é negativo', () => {
  it('rejeita saque acima do saldo sem mutar o saldo', async () => {
    const h = createHarness();
    await seedWallet(h, 'fi01-a', 5000);

    await expect(h.walletService.withdraw('fi01-a', 50.01)).rejects.toMatchObject({
      code: 'WALLET_INSUFFICIENT_FUNDS',
    });

    const wallet = (await h.walletService.findByUserId('fi01-a'))!;
    expect(wallet.balanceCents).toBe(5000);
    expect(wallet.balanceCents).toBeGreaterThanOrEqual(0);
  });

  it('rejeita lock acima do saldo sem mutar o saldo', async () => {
    const h = createHarness();
    await seedWallet(h, 'fi01-b', 3000);

    await expect(h.walletService.lock('fi01-b', 30.01)).rejects.toMatchObject({
      code: 'WALLET_INSUFFICIENT_FUNDS',
    });

    const wallet = (await h.walletService.findByUserId('fi01-b'))!;
    expect(wallet.balanceCents).toBe(3000);
  });

  it('sob concorrência de saques, o saldo observado nunca é negativo', async () => {
    const h = createHarness();
    await seedWallet(h, 'fi01-concurrent', 10000);
    const runConcurrent = createConcurrentRunner();

    const observedBalances: number[] = [];
    const originalFind = h.walletService.findByUserId.bind(h.walletService);
    h.walletService.findByUserId = async (userId: string) => {
      const wallet = await originalFind(userId);
      if (wallet) observedBalances.push(wallet.balanceCents);
      return wallet;
    };

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        runConcurrent('fi01-concurrent', () => h.walletService.withdraw('fi01-concurrent', 2)),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(50);
    expect(
      results.filter((r) => r.status === 'rejected' && isInsufficientFunds((r as PromiseRejectedResult).reason)),
    ).toHaveLength(50);
    for (const value of observedBalances) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect((await h.walletService.findByUserId('fi01-concurrent'))!.balanceCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FI-02 — lockedBalance nunca < 0
// ---------------------------------------------------------------------------

describe('FI-02 — o saldo bloqueado nunca é negativo', () => {
  const buildLocked = async (h: Harness, userId: string, lockedCents: number) => {
    await seedWallet(h, userId, 10000);
    await h.walletService.lock(userId, lockedCents / 100, {
      type: 'WITHDRAWAL_HOLD',
      referenceId: `hold-${userId}`,
      source: 'WITHDRAWAL',
    });
  };

  it('unlock acima do bloqueado é rejeitado e não produz locked negativo', async () => {
    const h = createHarness();
    await buildLocked(h, 'fi02-a', 4000);

    await expect(h.walletService.unlock('fi02-a', 60)).rejects.toMatchObject({
      code: 'WALLET_LOCKED_BALANCE_EXCEEDED',
    });

    const wallet = (await h.walletService.findByUserId('fi02-a'))!;
    expect(wallet.lockedBalanceCents).toBe(4000);
    expect(wallet.lockedBalanceCents).toBeGreaterThanOrEqual(0);
  });

  it('withdrawLocked acima do bloqueado é rejeitado e não produz locked negativo', async () => {
    const h = createHarness();
    await buildLocked(h, 'fi02-b', 4000);

    await expect(h.walletService.withdrawLocked('fi02-b', 40.01)).rejects.toMatchObject({
      code: 'WALLET_INSUFFICIENT_LOCKED_FUNDS',
    });

    const wallet = (await h.walletService.findByUserId('fi02-b'))!;
    expect(wallet.lockedBalanceCents).toBe(4000);
  });

  it('lockedBalance e balance somados preservam o patrimônio de forma contábil', async () => {
    const h = createHarness();
    await buildLocked(h, 'fi02-c', 2500);

    const wallet = (await h.walletService.findByUserId('fi02-c'))!;
    expect(wallet.balanceCents + wallet.lockedBalanceCents).toBe(10000);
    expect(wallet.balanceCents).toBeGreaterThanOrEqual(0);
    expect(wallet.lockedBalanceCents).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// FI-03 — exposição nunca < 0
// ---------------------------------------------------------------------------

describe('FI-03 — a exposição de risco nunca é negativa', () => {
  it('decreaseExposure acima da exposição satura em 0, nunca negativando', () => {
    const profile = new RiskProfile('fi03-a', 3000, 10000);
    profile.decreaseExposure(8000);
    expect(profile.exposureCents).toBe(0);
    expect(profile.exposureCents).toBeGreaterThanOrEqual(0);
  });

  it('diminuição exata não inverte o sinal', () => {
    const profile = new RiskProfile('fi03-b', 5000, 10000);
    profile.increaseExposure(1000);
    profile.decreaseExposure(6000);
    expect(profile.exposureCents).toBe(0);
  });

  it('RiskService (in-memory) nunca revela exposição negativa após reduções excessivas', async () => {
    const service = new RiskService();
    await service.reserveExposure('fi03-c', 1000);
    await service.reduceExposure('fi03-c', 5000);
    expect(await service.getExposureForUser('fi03-c')).toBe(0);
    expect(await service.getExposureForUser('fi03-c')).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// FI-04 — withdrawal nunca pode pagar duas vezes
// ---------------------------------------------------------------------------

describe('FI-04 — um saque nunca paga duas vezes', () => {
  const buildWithdrawalStack = async (userId: string) => {
    const walletRepo = new WalletRepository();
    const ledgerRepo = new InMemoryLedgerRepository();
    const walletService = new WalletService(walletRepo, ledgerRepo);
    await walletService.createWallet({ userId, currency: 'BRL' });
    await walletService.deposit(userId, 100, {
      type: 'DEPOSIT',
      referenceId: `seed-${userId}`,
      source: 'DEPOSIT',
    });

    const requests = new Map<string, WithdrawalRequest>();
    const repository = {
      create: jest.fn(async (r: WithdrawalRequest) => {
        requests.set(r.id, r);
        return r;
      }),
      update: jest.fn(async (r: WithdrawalRequest) => {
        requests.set(r.id, r);
        return r;
      }),
      findById: jest.fn(async (id: string) => requests.get(id) ?? null),
      findByUserId: jest.fn(async (uid: string) =>
        [...requests.values()].filter((r) => r.userId === uid),
      ),
      listPending: jest.fn(async () => [...requests.values()]),
    };

    const service = new WithdrawalRequestService(repository as any, walletService);
    return { walletService, ledgerRepo, service };
  };

  it('ciclo completo + retry do worker: debita o saldo bloqueado apenas uma vez', async () => {
    const { walletService, ledgerRepo, service } = await buildWithdrawalStack('fi04-a');

    const request = await service.createRequest('fi04-a', 40, 'BRL');

    let wallet = (await walletService.findByUserId('fi04-a'))!;
    expect(wallet.balanceCents).toBe(6000);
    expect(wallet.lockedBalanceCents).toBe(4000);

    await service.processRequest(request.id, 'admin', 'APPROVED', 'ok');
    await service.markProcessing(request.id);
    await service.completePayout(request.id);

    wallet = (await walletService.findByUserId('fi04-a'))!;
    expect(wallet.balanceCents).toBe(6000);
    expect(wallet.lockedBalanceCents).toBe(0);

    // Retry do worker / notificação duplicada do provider.
    await expect(service.completePayout(request.id)).rejects.toMatchObject({ code: 'CONFLICT' });

    wallet = (await walletService.findByUserId('fi04-a'))!;
    expect(wallet.balanceCents).toBe(6000);
    expect(wallet.lockedBalanceCents).toBe(0);

    const completed = (await ledgerRepo.findByUserId('fi04-a', { limit: 1000 })).filter(
      (e) => e.type === 'WITHDRAWAL_COMPLETED',
    );
    expect(completed).toHaveLength(1);
    expect(completed[0].amountCents).toBe(4000);
    expect(completed[0].transactionId).toBe(`WITHDRAWAL_COMPLETED:${request.id}`);
    expect(completed[0].referenceId).toBe(request.id);
  });

  it('withdrawLocked reexecutado com a mesma referência não debita duas vezes', async () => {
    const { walletService, ledgerRepo } = await buildWithdrawalStack('fi04-b');

    await walletService.lock('fi04-b', 40, {
      type: 'WITHDRAWAL_HOLD',
      referenceId: 'wd-dup',
      source: 'WITHDRAWAL',
    });
    const context = {
      type: 'WITHDRAWAL_COMPLETED' as const,
      referenceId: 'fi04-b-request',
      source: 'WITHDRAWAL',
    };
    await walletService.withdrawLocked('fi04-b', 40, context);
    await walletService.withdrawLocked('fi04-b', 40, context);

    const wallet = (await walletService.findByUserId('fi04-b'))!;
    expect(wallet.balanceCents).toBe(6000);
    expect(wallet.lockedBalanceCents).toBe(0);

    const completed = (await ledgerRepo.findByUserId('fi04-b', { limit: 1000 })).filter(
      (e) => e.type === 'WITHDRAWAL_COMPLETED',
    );
    expect(completed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// FI-05 — bet nunca pode ser liquidada duas vezes
// ---------------------------------------------------------------------------

describe('FI-05 — uma aposta nunca é liquidada duas vezes', () => {
  it('domain: resolve a partir de status não-PENDING é rejeitado', () => {
    const bet = new Bet(
      'bet-1',
      'u',
      'e',
      'm',
      new Money(100, 'BRL'),
      new Odds(2),
      'PENDING',
      'SINGLE',
      new Date(),
    );

    bet.resolve('WON');
    expect(bet.status).toBe('WON');

    expect(() => bet.resolve('WON')).toThrow(/Only pending bets can be resolved/);
    expect(() => bet.resolve('LOST')).toThrow(/Only pending bets can be resolved/);
    expect(() => bet.cancel('x')).toThrow(/Only pending bets can be canceled/);
  });

  it('service: retry de liquidação não altera saldo e não cria segundo crédito', async () => {
    const h = createHarness();
    await seedWallet(h, 'fi05-a', 10000);
    const betId = await placeBet(h, 'fi05-a', 100);

    const service = makeBetService(h);
    await service.resolveBet({ betId, result: 'WON', marketResult: 'HOME_WIN' });

    let wallet = (await h.walletService.findByUserId('fi05-a'))!;
    expect(wallet.balanceCents).toBe(19000);

    await expect(
      service.resolveBet({ betId, result: 'WON', marketResult: 'HOME_WIN' }),
    ).rejects.toMatchObject({
      code: 'BET_NOT_PENDING',
    });
    await expect(
      service.resolveBet({ betId, result: 'LOST', marketResult: 'AWAY_WIN' }),
    ).rejects.toMatchObject({
      code: 'BET_NOT_PENDING',
    });

    wallet = (await h.walletService.findByUserId('fi05-a'))!;
    expect(wallet.balanceCents).toBe(19000);

    const wins = (await ledgerEntriesOf(h, 'fi05-a')).filter((e) => e.type === 'BET_WIN');
    expect(wins).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// FI-06 — transactionId nunca é reutilizado
// ---------------------------------------------------------------------------

describe('FI-06 — um transactionId nunca é reutilizado para movimentos diferentes', () => {
  it('replay da mesma operação não cria segundo movimento nem segundo id', async () => {
    const h = createHarness();
    await seedWallet(h, 'fi06-a', 10000);

    const context = { type: 'BET_DEBIT' as const, referenceId: 'bet-1', source: 'BET' };
    await h.walletService.withdraw('fi06-a', 40, context);
    await h.walletService.withdraw('fi06-a', 40, context);

    const debits = (await ledgerEntriesOf(h, 'fi06-a')).filter((e) => e.type === 'BET_DEBIT');
    expect(debits).toHaveLength(1);
    expect(debits[0].transactionId).toBe('BET_DEBIT:bet-1');
    expect((await h.walletService.findByUserId('fi06-a'))!.balanceCents).toBe(6000);
  });

  it('mesma referenceId com tipos distintos produz transactionIds distintos', async () => {
    const h = createHarness();
    await seedWallet(h, 'fi06-b', 10000);

    await h.walletService.withdraw('fi06-b', 40, {
      type: 'BET_DEBIT',
      referenceId: 'bet-2',
      source: 'BET',
    });
    await h.walletService.deposit('fi06-b', 190, {
      type: 'BET_WIN',
      referenceId: 'bet-2',
      source: 'BET',
    });

    const entries = await ledgerEntriesOf(h, 'fi06-b');
    const ids = entries.map((e) => e.transactionId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('BET_DEBIT:bet-2');
    expect(ids).toContain('BET_WIN:bet-2');
  });

  it('referenceIds diferentes geram ids diferentes e ambos são aplicados', async () => {
    const h = createHarness();
    await seedWallet(h, 'fi06-c', 10000);

    await h.walletService.deposit('fi06-c', 5, {
      type: 'DEPOSIT',
      referenceId: 'ref-a',
      source: 'DEPOSIT',
    });
    await h.walletService.deposit('fi06-c', 7, {
      type: 'DEPOSIT',
      referenceId: 'ref-b',
      source: 'DEPOSIT',
    });

    expect((await h.walletService.findByUserId('fi06-c'))!.balanceCents).toBe(11200);

    const ids = (await ledgerEntriesOf(h, 'fi06-c')).map((e) => e.transactionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// FI-07 — idempotency key não muda de operação
// ---------------------------------------------------------------------------

describe('FI-07 — uma Idempotency-Key não muda de operação', () => {
  it('mesma key com fingerprint diferente → CONFLICT 409', async () => {
    const service = new IdempotencyService(new InMemoryIdempotencyStore());
    await service.execute('fi07-op', 'fingerprint-A', async () => 'ok');

    await expect(service.execute('fi07-op', 'fingerprint-B', async () => 'ok')).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });

  it('replay com o mesmo fingerprint devolve o resultado armazenado e não executa de novo', async () => {
    const service = new IdempotencyService(new InMemoryIdempotencyStore());
    let runs = 0;
    const operation = async () => {
      runs += 1;
      return { amount: 100, currency: 'BRL' };
    };

    const first = await service.execute('fi07-replay', 'same-fingerprint', operation);
    const second = await service.execute('fi07-replay', 'same-fingerprint', operation);

    expect(runs).toBe(1);
    expect(first).toEqual({ amount: 100, currency: 'BRL' });
    expect(second).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// FI-08 — WIN gera exatamente um crédito
// ---------------------------------------------------------------------------

describe('FI-08 — WIN gera exatamente um crédito', () => {
  it('liquidação WIN credita potentialReturn uma única vez, no valor exato', async () => {
    const h = createHarness();
    await seedWallet(h, 'fi08-a', 10000);
    const betId = await placeBet(h, 'fi08-a', 100);

    const service = makeBetService(h);
    await service.resolveBet({ betId, result: 'WON', marketResult: 'HOME_WIN' });

    const wallet = (await h.walletService.findByUserId('fi08-a'))!;
    // 100,00 + 190,00 (retorno) − 100,00 (stake) = 190,00
    expect(wallet.balanceCents).toBe(19000);

    const wins = (await ledgerEntriesOf(h, 'fi08-a')).filter((e) => e.type === 'BET_WIN');
    expect(wins).toHaveLength(1);
    expect(wins[0].amountCents).toBe(19000);
    expect(wins[0].referenceId).toBe(betId);

    const bets = await h.betRepo.findByUserId('fi08-a');
    expect(bets).toHaveLength(1);
    expect(bets[0].status).toBe('WON');
  });
});

// ---------------------------------------------------------------------------
// FI-09 — CANCEL gera exatamente um refund
// ---------------------------------------------------------------------------

describe('FI-09 — CANCEL gera exatamente um refund', () => {
  it('cancelamento devolve a stake uma única vez, no valor exato', async () => {
    const h = createHarness();
    await seedWallet(h, 'fi09-a', 10000);
    const betId = await placeBet(h, 'fi09-a', 100);

    const walletAfterBet = (await h.walletService.findByUserId('fi09-a'))!;
    expect(walletAfterBet.balanceCents).toBe(0);

    const service = makeBetService(h);
    await service.cancelBet({ betId, canceledBy: 'fi09-a', reason: 'INVARIANT_TEST' });

    const wallet = (await h.walletService.findByUserId('fi09-a'))!;
    expect(wallet.balanceCents).toBe(10000);

    const refunds = (await ledgerEntriesOf(h, 'fi09-a')).filter((e) => e.type === 'BET_REFUND');
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amountCents).toBe(10000);
    expect(refunds[0].referenceId).toBe(betId);

    const bets = await h.betRepo.findByUserId('fi09-a');
    expect(bets[0].status).toBe('CANCELED');
  });

  it('retry de cancelamento não devolve nada de novo', async () => {
    const h = createHarness();
    await seedWallet(h, 'fi09-b', 10000);
    const betId = await placeBet(h, 'fi09-b', 100);

    const service = makeBetService(h);
    await service.cancelBet({ betId, canceledBy: 'fi09-b', reason: 'INVARIANT_TEST' });
    await expect(
      service.cancelBet({ betId, canceledBy: 'fi09-b', reason: 'INVARIANT_TEST' }),
    ).rejects.toMatchObject({ code: 'BET_NOT_PENDING' });

    const wallet = (await h.walletService.findByUserId('fi09-b'))!;
    expect(wallet.balanceCents).toBe(10000);
    expect((await ledgerEntriesOf(h, 'fi09-b')).filter((e) => e.type === 'BET_REFUND')).toHaveLength(
      1,
    );
  });
});

// ---------------------------------------------------------------------------
// FI-10 — LOSS não gera prêmio
// ---------------------------------------------------------------------------

describe('FI-10 — LOSS não gera prêmio', () => {
  it('liquidação LOST não credita nada e mantém só a stake debitada', async () => {
    const h = createHarness();
    await seedWallet(h, 'fi10-a', 10000);
    const betId = await placeBet(h, 'fi10-a', 100);

    const service = makeBetService(h);
    await service.resolveBet({ betId, result: 'LOST', marketResult: 'AWAY_WIN' });

    const wallet = (await h.walletService.findByUserId('fi10-a'))!;
    expect(wallet.balanceCents).toBe(0);

    const wins = (await ledgerEntriesOf(h, 'fi10-a')).filter((e) => e.type === 'BET_WIN');
    expect(wins).toHaveLength(0);

    const prizeEntries = (await ledgerEntriesOf(h, 'fi10-a')).filter(
      (e) => e.type === 'BET_WIN' || e.type === 'BET_REFUND',
    );
    expect(prizeEntries).toHaveLength(0);

    const bets = await h.betRepo.findByUserId('fi10-a');
    expect(bets[0].status).toBe('LOST');
  });
});