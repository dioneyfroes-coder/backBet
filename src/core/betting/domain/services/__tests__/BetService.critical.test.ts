process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

import { BetService } from '../BetService';
import { BetRepository } from '@/core/betting/domain/repositories/BetRepository';
import { EventRepository } from '@/core/betting/domain/repositories/EventRepository';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { InMemoryLedgerRepository } from '@/core/finance/domain/repositories/InMemoryLedgerRepository';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { LedgerEntry } from '@/core/finance/domain/entities/LedgerEntry';
import { Bet } from '../../entities/Bet';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { Event, Market } from '../../entities/Event';
import { Odds } from '@core/odds/domain/value-objects/Odds';
import { TransactionRunner, TransactionSession } from '@/core/shared/types/Transaction';
import { ICreateBetDTO } from '@core/betting/types/bet.types';

const FOOTBALL_EVENT = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const MARKET_ID = 'mkt-1x2';
const ODD_ID = 'home';
const USER_ID = 'user-critical';

function createHarness() {
  const walletRepo = new WalletRepository();
  const ledgerRepo = new InMemoryLedgerRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const betRepo = new BetRepository();
  const eventRepo = new EventRepository();
  return { walletRepo, ledgerRepo, walletService, betRepo, eventRepo };
}

function baseInput(userId: string): ICreateBetDTO {
  return {
    userId,
    eventId: FOOTBALL_EVENT,
    marketId: MARKET_ID,
    oddId: ODD_ID,
    amount: 100,
    type: 'SINGLE',
  };
}

const allowedRisk = {
  canPlaceBet: async () => true,
  reserveExposure: async () => true,
  reserveEventExposure: async () => true,
  reserveMarketExposure: async () => true,
} as unknown as RiskService;

async function withRollback<T>(
  harness: ReturnType<typeof createHarness>,
  work: (session: TransactionSession) => Promise<T>,
): Promise<T> {
  const wallets = [...(harness.walletRepo as unknown as { wallets: Wallet[] }).wallets];
  const bets = [...(harness.betRepo as unknown as { bets: Bet[] }).bets];
  const entries = [...(harness.ledgerRepo as unknown as { entries: LedgerEntry[] }).entries];
  try {
    return await work({});
  } catch (error) {
    (harness.walletRepo as unknown as { wallets: Wallet[] }).wallets = wallets;
    (harness.betRepo as unknown as { bets: Bet[] }).bets = bets;
    (harness.ledgerRepo as unknown as { entries: LedgerEntry[] }).entries = entries;
    throw error;
  }
}

describe('BetService — cenários críticos (Fase 20)', () => {
  it('saldo insuficiente: rejeita a aposta e não cria registro nem move saldo', async () => {
    const harness = createHarness();
    const betService = new BetService(
      harness.betRepo,
      harness.eventRepo,
      harness.walletService,
      allowedRisk,
    );

    await harness.walletService.createWallet({ userId: USER_ID, currency: 'BRL' });
    await harness.walletService.deposit(USER_ID, 50, {
      type: 'DEPOSIT',
      referenceId: 'seed-low-balance',
      source: 'DEPOSIT',
    });

    await expect(
      betService.placeBet({ ...baseInput(USER_ID), amount: 100 }),
    ).rejects.toMatchObject({ code: 'WALLET_INSUFFICIENT_FUNDS' });

    await expect(harness.betRepo.findByUserId(USER_ID)).resolves.toEqual([]);
    const wallet = await harness.walletService.findByUserId(USER_ID);
    expect(wallet?.balance).toBe(50);
    expect(wallet?.lockedBalance).toBe(0);
  });

  it('rollback de transação: falha pós-débito restaura saldo, não persiste aposta nem ledger', async () => {
    const harness = createHarness();
    const failingRisk = {
      canPlaceBet: async () => true,
      reserveExposure: async () => {
        throw new DomainError({ code: 'RISK_LIMIT_EXCEEDED', message: 'exposure limite' });
      },
      reserveEventExposure: async () => true,
      reserveMarketExposure: async () => true,
    } as unknown as RiskService;
    const runner: TransactionRunner = {
      withTransaction: (work) => withRollback(harness, work),
    };
    const betService = new BetService(
      harness.betRepo,
      harness.eventRepo,
      harness.walletService,
      failingRisk,
      runner,
    );

    await harness.walletService.createWallet({ userId: USER_ID, currency: 'BRL' });
    await harness.walletService.deposit(USER_ID, 1000, {
      type: 'DEPOSIT',
      referenceId: 'seed-rollback',
      source: 'DEPOSIT',
    });

    await expect(betService.placeBet(baseInput(USER_ID))).rejects.toMatchObject({
      code: 'RISK_LIMIT_EXCEEDED',
    });

    const wallet = await harness.walletService.findByUserId(USER_ID);
    expect(wallet?.balance).toBe(1000);
    expect(wallet?.lockedBalance).toBe(0);
    await expect(harness.betRepo.findByUserId(USER_ID)).resolves.toEqual([]);
    const { entries } = await harness.walletService.getLedgerHistory(USER_ID, 50, 0);
    expect(entries.filter((entry) => entry.type === 'BET_DEBIT')).toHaveLength(0);
    expect(entries).toHaveLength(1);
  });

  it('apostas simultâneas: nenhuma dupla cobrança e saldo nunca fica negativo', async () => {
    const harness = createHarness();
    const betService = new BetService(
      harness.betRepo,
      harness.eventRepo,
      harness.walletService,
      allowedRisk,
    );

    await harness.walletService.createWallet({ userId: USER_ID, currency: 'BRL' });
    await harness.walletService.deposit(USER_ID, 1000, {
      type: 'DEPOSIT',
      referenceId: 'seed-concurrency',
      source: 'DEPOSIT',
    });

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => betService.placeBet(baseInput(USER_ID))),
    );
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(fulfilled.length).toBeLessThanOrEqual(10);
    expect(rejected.length).toBe(20 - fulfilled.length);

    const wallet = await harness.walletService.findByUserId(USER_ID);
    expect(wallet?.balance).toBe(1000 - 100 * fulfilled.length);
    expect(wallet?.balance).toBeGreaterThanOrEqual(0);
    expect(wallet?.lockedBalance).toBe(0);

    const bets = await harness.betRepo.findByUserId(USER_ID);
    expect(bets.length).toBe(fulfilled.length);
    expect(bets.every((bet) => bet.status === 'PENDING')).toBe(true);

    const { entries } = await harness.walletService.getLedgerHistory(USER_ID, 500, 0);
    const debits = entries.filter((entry) => entry.type === 'BET_DEBIT');
    expect(debits.length).toBe(fulfilled.length);
    const debitSum = debits.reduce((sum, entry) => sum + entry.amountCents, 0);
    expect(debitSum).toBe(100 * fulfilled.length * 100);
  });

  it('write-conflict do Mongo na transação (MongoServerError 112): re-executa a aposta inteira', async () => {
    const harness = createHarness();
    let attempts = 0;
    const writeConflict = () =>
      Object.assign(new Error('Write conflict during plan execution and yielding is disabled.'), {
        name: 'MongoServerError',
        code: 112,
      });
    const runner: TransactionRunner = {
      withTransaction: async (work) => {
        attempts += 1;
        if (attempts === 1) throw writeConflict();
        return withRollback(harness, work);
      },
    };
    const betService = new BetService(
      harness.betRepo,
      harness.eventRepo,
      harness.walletService,
      allowedRisk,
      runner,
    );

    await harness.walletService.createWallet({ userId: USER_ID, currency: 'BRL' });
    await harness.walletService.deposit(USER_ID, 1000, {
      type: 'DEPOSIT',
      referenceId: 'seed-write-conflict',
      source: 'DEPOSIT',
    });

    const bet = await betService.placeBet(baseInput(USER_ID));

    expect(attempts).toBe(2);
    expect(bet.status).toBe('PENDING');

    const wallet = await harness.walletService.findByUserId(USER_ID);
    expect(wallet?.balance).toBe(900);
    expect(wallet?.lockedBalance).toBe(0);
    await expect(harness.betRepo.findByUserId(USER_ID)).resolves.toHaveLength(1);
    const { entries } = await harness.walletService.getLedgerHistory(USER_ID, 500, 0);
    expect(entries.filter((entry) => entry.type === 'BET_DEBIT')).toHaveLength(1);
  });

  describe('placeBet — race Event/Market/odd (item #6)', () => {
    const buildEventVariant = (
      overrides: { status?: Event['status']; marketStatus?: Market['status']; oddValue?: number },
    ): Event =>
      new Event(
        FOOTBALL_EVENT,
        'FC Tech vs Dev United',
        new Date(Date.now() + 60 * 60 * 1000),
        overrides.status ?? 'SCHEDULED',
        'Football',
        ['FC Tech', 'Dev United'],
        new Map([
          [
            MARKET_ID,
            new Market(
              MARKET_ID,
              'Resultado Final',
              overrides.marketStatus ?? 'OPEN',
              new Map([[ODD_ID, new Odds(overrides.oddValue ?? 1.9)]]),
            ),
          ],
        ]),
      );

    const fundUser = async (harness: ReturnType<typeof createHarness>): Promise<void> => {
      await harness.walletService.createWallet({ userId: USER_ID, currency: 'BRL' });
      await harness.walletService.deposit(USER_ID, 1000, {
        type: 'DEPOSIT',
        referenceId: `seed-race-${Date.now()}`,
        source: 'DEPOSIT',
      });
    };

    const mockSequentialReads = (
      harness: ReturnType<typeof createHarness>,
      first: Event,
      second: Event,
    ): jest.SpyInstance => {
      let call = 0;
      return jest.spyOn(harness.eventRepo, 'findById').mockImplementation(async () => {
        call += 1;
        return call === 1 ? first : second;
      });
    };

    it('mercado suspenso entre a leitura e a transação: aposta rejeitada sem efeito financeiro', async () => {
      const harness = createHarness();
      const betService = new BetService(
        harness.betRepo,
        harness.eventRepo,
        harness.walletService,
        allowedRisk,
      );
      await fundUser(harness);

      const spy = mockSequentialReads(
        harness,
        buildEventVariant({ marketStatus: 'OPEN' }),
        buildEventVariant({ marketStatus: 'SUSPENDED' }),
      );

      await expect(betService.placeBet(baseInput(USER_ID))).rejects.toMatchObject({
        code: 'MARKET_NOT_OPEN_FOR_BETTING',
      });

      const wallet = await harness.walletService.findByUserId(USER_ID);
      expect(wallet?.balance).toBe(1000);
      expect(wallet?.lockedBalance).toBe(0);
      await expect(harness.betRepo.findByUserId(USER_ID)).resolves.toEqual([]);
      const { entries } = await harness.walletService.getLedgerHistory(USER_ID, 500, 0);
      expect(entries.filter((entry) => entry.type === 'BET_DEBIT')).toHaveLength(0);

      spy.mockRestore();
    });

    it('odd alterada entre a leitura e a transação: rejeita com ODD_CHANGED (refresh do cliente)', async () => {
      const harness = createHarness();
      const betService = new BetService(
        harness.betRepo,
        harness.eventRepo,
        harness.walletService,
        allowedRisk,
      );
      await fundUser(harness);

      const spy = mockSequentialReads(
        harness,
        buildEventVariant({ oddValue: 1.9 }),
        buildEventVariant({ oddValue: 1.7 }),
      );

      await expect(betService.placeBet(baseInput(USER_ID))).rejects.toMatchObject({
        code: 'ODD_CHANGED',
      });

      const wallet = await harness.walletService.findByUserId(USER_ID);
      expect(wallet?.balance).toBe(1000);
      await expect(harness.betRepo.findByUserId(USER_ID)).resolves.toEqual([]);

      spy.mockRestore();
    });

    it('evento passa a LIVE entre a leitura e a transação: aposta rejeitada', async () => {
      const harness = createHarness();
      const betService = new BetService(
        harness.betRepo,
        harness.eventRepo,
        harness.walletService,
        allowedRisk,
      );
      await fundUser(harness);

      const spy = mockSequentialReads(
        harness,
        buildEventVariant({ status: 'SCHEDULED' }),
        buildEventVariant({ status: 'LIVE' }),
      );

      await expect(betService.placeBet(baseInput(USER_ID))).rejects.toMatchObject({
        code: 'EVENT_NOT_OPEN_FOR_BETTING',
      });

      const wallet = await harness.walletService.findByUserId(USER_ID);
      expect(wallet?.balance).toBe(1000);
      await expect(harness.betRepo.findByUserId(USER_ID)).resolves.toEqual([]);

      spy.mockRestore();
    });

    it('estado estável: aposta aceita normalmente (revalidação é no-op)', async () => {
      const harness = createHarness();
      const betService = new BetService(
        harness.betRepo,
        harness.eventRepo,
        harness.walletService,
        allowedRisk,
      );
      await fundUser(harness);

      const spy = jest.spyOn(harness.eventRepo, 'findById').mockImplementation(async () =>
        buildEventVariant({ marketStatus: 'OPEN', oddValue: 1.9 }),
      );

      const bet = await betService.placeBet(baseInput(USER_ID));
      expect(bet.status).toBe('PENDING');

      const wallet = await harness.walletService.findByUserId(USER_ID);
      expect(wallet?.balance).toBe(900);

      spy.mockRestore();
    });
  });
});