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
});