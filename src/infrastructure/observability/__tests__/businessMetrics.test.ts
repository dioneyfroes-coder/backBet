import { BetService } from '@/core/betting/domain/services/BetService';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { Event, Market } from '@/core/betting/domain/entities/Event';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@core/odds/domain/value-objects/Odds';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { InMemoryRiskRepository } from '@/infrastructure/persistence/inmemory/repositories/InMemoryRiskRepository';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { AppError } from '@/shared/errors/AppError';
import {
  metricsRegistry,
  betsPlacedCounter,
  betsRejectedCounter,
  betsWonCounter,
  betsLostCounter,
  depositsCounter,
  withdrawalsCounter,
  riskRejectionsCounter,
  riskReconciliationMismatchCounter,
  transactionFailuresCounter,
  withdrawalQueueBacklogGauge,
} from '@/infrastructure/observability/metrics';
import { isInfraTransactionFailure } from '@/infrastructure/observability/transactionFailure';
import { RISK_CONFIG } from '@/core/risk/config/risk-config';

type CounterLike = {
  reset: () => void;
  get: () => any;
};

const counterValue = async (counter: CounterLike): Promise<number> => {
  try {
    const metric = await counter.get();
    return metric?.values?.reduce((sum: number, v: { value?: number }) => sum + (v?.value ?? 0), 0) ?? 0;
  } catch {
    return 0;
  }
};

const counterDelta = async (counter: CounterLike, before: number): Promise<number> =>
  (await counterValue(counter)) - before;

const makeEvent = (): Event =>
  new Event(
    'event-1',
    'Championship',
    new Date(),
    'SCHEDULED',
    'Football',
    ['Team A', 'Team B'],
    new Map([
      ['market-a', new Market('market-a', 'Winner', 'OPEN', new Map([['odd-a', new Odds(2.4)]]))],
    ]),
  );

const makeBet = (): Bet =>
  new Bet(
    'bet-1',
    'u1',
    'event-1',
    'market-a',
    new Money(100, 'BRL'),
    new Odds(2),
    'PENDING',
    'SINGLE',
    new Date(),
    new Date(0),
    '',
  );

const makeWalletStub = () => {
  const wallets = new Map<string, unknown>();
  return {
    save: jest.fn(async (wallet: { userId: string }) => {
      wallets.set(wallet.userId, wallet);
    }),
    findByUserId: jest.fn(async (userId: string) => wallets.get(userId) ?? null),
    update: jest.fn(async (wallet: unknown) => wallet),
  } as any;
};

const makeBetRepositoryStub = () => ({
  create: jest.fn(async () => undefined),
  update: jest.fn(async () => undefined),
  findById: jest.fn(),
  findByUserId: jest.fn(async () => []),
  findByEventId: jest.fn(async () => []),
  findByMarketId: jest.fn(async () => []),
} as any);

const makeWalletServiceStub = () => ({
  withdraw: jest.fn(async () => ({ currency: 'BRL' })),
  deposit: jest.fn(async () => ({ currency: 'BRL' })),
} as any);

const ALL_COUNTERS: CounterLike[] = [
  betsPlacedCounter,
  betsRejectedCounter,
  betsWonCounter,
  betsLostCounter,
  depositsCounter,
  withdrawalsCounter,
  riskRejectionsCounter,
  riskReconciliationMismatchCounter,
  transactionFailuresCounter,
];

describe('metricas de negocio (Fase 23)', () => {
  let originalBlacklist: string[];

  beforeEach(() => {
    ALL_COUNTERS.forEach((c) => c.reset());
    withdrawalQueueBacklogGauge.reset();
    originalBlacklist = [...RISK_CONFIG.BLACKLIST_USER_IDS];
  });

  afterEach(() => {
    RISK_CONFIG.BLACKLIST_USER_IDS = originalBlacklist;
  });

  it('registra o catalogo completo de metricas no registry Prometheus', async () => {
    const payload = (await metricsRegistry.getMetricsAsJSON()) as unknown as Array<{ name: string }>;
    const names = new Set(payload.map((m) => m.name));
    [
      'backbet_bets_total',
      'backbet_bets_rejected_total',
      'backbet_bets_won_total',
      'backbet_bets_lost_total',
      'backbet_deposits_total',
      'backbet_withdrawals_total',
      'backbet_risk_rejections_total',
      'backbet_risk_reconciliation_mismatches_total',
      'backbet_transaction_failures_total',
      'backbet_withdrawal_queue_backlog',
    ].forEach((name) => expect(names.has(name)).toBe(true));
  });

  describe('WalletService', () => {
    it('incrementa deposits_total a cada credito real e withdrawals_total a cada saque', async () => {
      const walletStub = makeWalletStub();
      const walletService = new WalletService(walletStub);
      await walletService.createWallet({ userId: 'u1', currency: 'BRL' });
      await walletService.deposit('u1', 100, { type: 'DEPOSIT', referenceId: 'dep-1' });
      await walletService.deposit('u1', 50, { type: 'BET_WIN', referenceId: 'bet-1' });
      await walletService.withdraw('u1', 20, { type: 'WITHDRAWAL_COMPLETED', referenceId: 'wd-1' });

      expect(await counterDelta(depositsCounter, 0)).toBe(2);
      expect(await counterDelta(withdrawalsCounter, 0)).toBe(1);
    });

    it('nao conta replays idempotentes como novo deposito', async () => {
      const walletStub = makeWalletStub();
      const ledger = {
        exists: jest.fn(async () => true),
        append: jest.fn(async () => undefined),
        findByUserId: jest.fn(async () => []),
        countByUserId: jest.fn(async () => 0),
        withTransaction: jest.fn(async <T>(work: (session: unknown) => Promise<T>) => work(undefined)),
      } as any;
      const walletService = new WalletService(walletStub, ledger);
      await walletService.createWallet({ userId: 'u1', currency: 'BRL' });
      await walletService.deposit('u1', 100, { type: 'DEPOSIT', referenceId: 'dep-1' });

      expect(await counterDelta(depositsCounter, 0)).toBe(0);
    });
  });

  describe('BetService', () => {
    it('incrementa bets_total quando a aposta e criada com sucesso', async () => {
      const betRepo = makeBetRepositoryStub();
      const eventRepo = { findById: jest.fn(async () => makeEvent()) } as any;
      const riskService = new RiskService(new InMemoryRiskRepository(), betRepo);
      const service = new BetService(betRepo, eventRepo, makeWalletServiceStub(), riskService);

      await service.placeBet({
        userId: 'u1',
        eventId: 'event-1',
        marketId: 'market-a',
        oddId: 'odd-a',
        amount: 100,
        type: 'SINGLE',
      });

      expect(await counterDelta(betsPlacedCounter, 0)).toBe(1);
      expect(await counterDelta(betsRejectedCounter, 0)).toBe(0);
    });

    it('incrementa bets_rejected e risk_rejections quando a aposta e rejeitada por blacklist', async () => {
      RISK_CONFIG.BLACKLIST_USER_IDS = ['u1'];
      const betRepo = makeBetRepositoryStub();
      const eventRepo = { findById: jest.fn(async () => makeEvent()) } as any;
      const riskService = new RiskService(new InMemoryRiskRepository(), betRepo);
      const service = new BetService(betRepo, eventRepo, makeWalletServiceStub(), riskService);

      await expect(
        service.placeBet({
          userId: 'u1',
          eventId: 'event-1',
          marketId: 'market-a',
          oddId: 'odd-a',
          amount: 100,
          type: 'SINGLE',
        }),
      ).rejects.toThrow('Bet rejected by risk rules');

      expect(await counterDelta(betsRejectedCounter, 0)).toBe(1);
      expect(await counterDelta(betsPlacedCounter, 0)).toBe(0);
      expect(await counterDelta(riskRejectionsCounter, 0)).toBe(1);
    });

    it('incrementa bets_rejected e risk_rejections quando o limite de exposicao e excedido', async () => {
      const betRepo = makeBetRepositoryStub();
      const eventRepo = { findById: jest.fn(async () => makeEvent()) } as any;
      const riskService = {
        canPlaceBet: jest.fn(async () => true),
        reserveExposure: jest.fn(async () => false),
        reserveEventExposure: jest.fn(async () => true),
        reserveMarketExposure: jest.fn(async () => true),
        reduceExposure: jest.fn(async () => undefined),
        reduceEventExposure: jest.fn(async () => undefined),
        reduceMarketExposure: jest.fn(async () => undefined),
      } as unknown as RiskService;
      const service = new BetService(betRepo, eventRepo, makeWalletServiceStub(), riskService);

      await expect(
        service.placeBet({
          userId: 'u1',
          eventId: 'event-1',
          marketId: 'market-a',
          oddId: 'odd-a',
          amount: 100,
          type: 'SINGLE',
        }),
      ).rejects.toMatchObject({ code: 'RISK_LIMIT_EXCEEDED' });

      expect(await counterDelta(betsRejectedCounter, 0)).toBe(1);
      expect(await counterDelta(betsPlacedCounter, 0)).toBe(0);
      expect(await counterDelta(riskRejectionsCounter, 0)).toBe(1);
    });

    it('incrementa bets_won/bets_lost conforme o resultado da resolucao', async () => {
      const betRepo = makeBetRepositoryStub();
      betRepo.findById.mockResolvedValue(makeBet());
      const service = new BetService(betRepo, {} as any, makeWalletServiceStub());

      await service.resolveBet({ betId: 'bet-1', result: 'WON', marketResult: 'Team A' });
      betRepo.findById.mockResolvedValue(makeBet());
      await service.resolveBet({ betId: 'bet-1', result: 'LOST', marketResult: 'Team A' });

      expect(await counterDelta(betsWonCounter, 0)).toBe(1);
      expect(await counterDelta(betsLostCounter, 0)).toBe(1);
    });
  });

  describe('RiskService', () => {
    it('incrementa risk_reconciliation_mismatches ao corrigir exposicao de usuario', async () => {
      const riskRepo = new InMemoryRiskRepository();
      await riskRepo.upsert(new RiskProfile('u1', 0, 1_000_000));
      const betRepo = makeBetRepositoryStub();
      betRepo.findByUserId.mockResolvedValue([makeBet()]);
      const riskService = new RiskService(riskRepo, betRepo);

      const result = await riskService.recalculateUserExposure('u1');

      expect(result.reconciled).toBe(true);
      expect(await counterDelta(riskReconciliationMismatchCounter, 0)).toBe(1);
    });

    it('incrementa risk_reconciliation_mismatches ao corrigir contador de evento', async () => {
      const riskRepo = new InMemoryRiskRepository();
      const betRepo = makeBetRepositoryStub();
      betRepo.findByEventId.mockResolvedValue([makeBet()]);
      const riskService = new RiskService(riskRepo, betRepo);

      const result = await riskService.recalculateCounter('EVENT', 'event-1');

      expect(result.reconciled).toBe(true);
      expect(await counterDelta(riskReconciliationMismatchCounter, 0)).toBe(1);
    });
  });
});

describe('isInfraTransactionFailure', () => {
  it('considera falha de infraestrutura apenas erros nao-domínio e nao-4xx', () => {
    expect(isInfraTransactionFailure(new Error('connection dropped'))).toBe(true);
    expect(isInfraTransactionFailure('raw error')).toBe(true);

    const domainError = new DomainError({
      code: 'RISK_LIMIT_EXCEEDED',
      message: 'exposure',
    });
    expect(isInfraTransactionFailure(domainError)).toBe(false);

    const conflict = new AppError('CONFLICT', 'Conflito de concorrência', 409);
    expect(isInfraTransactionFailure(conflict)).toBe(false);

    const internal = new AppError('INTERNAL_SERVER_ERROR', 'Erro ao atualizar carteira', 500);
    expect(isInfraTransactionFailure(internal)).toBe(true);
  });
});