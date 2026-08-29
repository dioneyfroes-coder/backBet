import { GetDailyFinancialSummary } from '../GetDailyFinancialSummary';
import { InMemoryLedgerRepository } from '@/core/finance/domain/repositories/InMemoryLedgerRepository';
import { LedgerEntry } from '@/core/finance/domain/entities/LedgerEntry';
import { BetRepository } from '@/core/betting/domain/repositories/BetRepository';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { InMemoryRiskRepository } from '@/infrastructure/persistence/inmemory/repositories/InMemoryRiskRepository';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { HouseTreasuryRepository } from '@/core/treasury/domain/repositories/HouseTreasuryRepository';
import { HouseWallet } from '@/core/treasury/domain/entities/HouseWallet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@/core/odds/domain/value-objects/Odds';
import { AppError } from '@/shared/errors/AppError';

const DATE = '2024-03-01';
const DAY_START = new Date(`${DATE}T00:00:00.000Z`);
const OTHER_DAY = new Date('2024-03-02T00:00:00.000Z');

const entry = (
  transactionId: string,
  userId: string,
  type: string,
  amountCents: number,
  currency: string,
  createdAt: Date,
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'REVERSED' = 'COMPLETED',
): LedgerEntry =>
  new LedgerEntry(
    transactionId,
    userId,
    type as never,
    amountCents,
    currency,
    `ref-${transactionId}`,
    'test',
    status,
    createdAt,
    undefined,
  );

const bet = (
  id: string,
  userId: string,
  amount: number,
  currency: 'BRL' | 'USD',
  status: 'PENDING' | 'WON',
  createdAt: Date,
): Bet =>
  new Bet(
    id,
    userId,
    'event-1',
    'market-1',
    new Money(amount, currency),
    new Odds(2),
    status,
    'SINGLE',
    createdAt,
  );

const setup = () => {
  const ledger = new InMemoryLedgerRepository();
  const bets = new BetRepository();
  const risk = new InMemoryRiskRepository();
  const treasury = new HouseTreasuryRepository();
  return { ledger, bets, risk, treasury };
};

const createUseCase = (deps: ReturnType<typeof setup>) =>
  new GetDailyFinancialSummary({
    ledgerRepository: deps.ledger,
    betRepository: deps.bets,
    riskRepository: deps.risk,
    treasuryRepository: deps.treasury,
    treasuryWalletId: 'house-primary',
    defaultCurrency: 'BRL',
  });

describe('GetDailyFinancialSummary', () => {
  it('agrega depósitos, saques, apostas, prêmios e reembolsos do dia', async () => {
    const deps = setup();
    deps.ledger.append(entry('dep-1', 'user-1', 'DEPOSIT', 15000, 'BRL', DAY_START));
    deps.ledger.append(entry('dep-2', 'user-2', 'DEPOSIT', 99900, 'USD', DAY_START));
    deps.ledger.append(entry('dep-tomorrow', 'user-1', 'DEPOSIT', 55500, 'BRL', OTHER_DAY));
    deps.ledger.append(entry('stake-1', 'user-1', 'BET_DEBIT', 2000, 'BRL', DAY_START));
    deps.ledger.append(entry('stake-2', 'user-2', 'BET_DEBIT', 3000, 'BRL', DAY_START));
    deps.ledger.append(entry('win-1', 'user-1', 'BET_WIN', 8000, 'BRL', DAY_START));
    deps.ledger.append(entry('win-2', 'user-1', 'GAME_WIN', 1000, 'BRL', DAY_START));
    deps.ledger.append(entry('refund-1', 'user-1', 'BET_REFUND', 500, 'BRL', DAY_START));
    deps.ledger.append(entry('payout-1', 'user-1', 'WITHDRAWAL_COMPLETED', 4000, 'BRL', DAY_START));

    const summary = await createUseCase(deps).execute({ date: DATE });
    const dto = summary.toDTO();

    expect(dto.date).toBe(DATE);
    expect(dto.currency).toBe('BRL');
    expect(dto.deposits).toEqual({ amount: 150, count: 1 });
    expect(dto.withdrawals).toEqual({ amount: 40, count: 1 });
    expect(dto.bets).toEqual({ amount: 50, count: 2 });
    expect(dto.prizes).toEqual({ amount: 90, count: 2 });
    expect(dto.refunds).toEqual({ amount: 5, count: 1 });
    expect(dto.grossGamingRevenue).toBe(-40);
  });

  it('calcula saques pendentes como holds abertos e exposição total', async () => {
    const deps = setup();
    deps.ledger.append(entry('hold-a', 'user-1', 'WITHDRAWAL_HOLD', 20000, 'BRL', OTHER_DAY));
    deps.ledger.append(entry('hold-b', 'user-2', 'WITHDRAWAL_HOLD', 5000, 'BRL', OTHER_DAY));
    deps.ledger.append(entry('hold-c', 'user-1', 'WITHDRAWAL_HOLD', 4000, 'BRL', DAY_START));
    deps.ledger.append(entry('payout-a', 'user-1', 'WITHDRAWAL_COMPLETED', 20000, 'BRL', OTHER_DAY));
    deps.ledger.append(entry('payout-c', 'user-1', 'WITHDRAWAL_COMPLETED', 4000, 'BRL', DAY_START));

    await deps.risk.upsert(new RiskProfile('user-1', 10000, 500000));
    await deps.risk.upsert(new RiskProfile('user-2', 2500, 500000));
    await deps.risk.upsert(new RiskProfile('user-3', 0, 500000));

    await deps.treasury.save(new HouseWallet('house-primary', 'BRL', 50000, 30000));

    const dto = await createUseCase(deps).execute({ date: DATE });

    expect(dto.toDTO().pendingWithdrawals).toEqual({ amount: 50, count: 1 });
    expect(dto.toDTO().exposure).toEqual({ amount: 125, openProfiles: 2 });
    expect(dto.toDTO().house).toEqual({ total: 800, profit: 500, prizeReserve: 300 });
  });

  it('soma apenas apostas PENDING na moeda do relatório', async () => {
    const deps = setup();
    deps.bets.create(bet('bet-1', 'user-1', 25, 'BRL', 'PENDING', DAY_START));
    deps.bets.create(bet('bet-2', 'user-1', 15, 'BRL', 'PENDING', DAY_START));
    deps.bets.create(bet('bet-3', 'user-2', 9.99, 'USD', 'PENDING', DAY_START));
    deps.bets.create(bet('bet-4', 'user-1', 5, 'BRL', 'WON', DAY_START));

    const dto = await createUseCase(deps).execute({ date: DATE });

    expect(dto.toDTO().pendingBets).toEqual({ amount: 40, count: 2 });
  });

  it('filtra por moeda quando informada', async () => {
    const deps = setup();
    deps.ledger.append(entry('dep-brl', 'user-1', 'DEPOSIT', 15000, 'BRL', DAY_START));
    deps.ledger.append(entry('dep-usd', 'user-2', 'DEPOSIT', 99900, 'USD', DAY_START));

    const usdDto = await createUseCase(deps).execute({ date: DATE, currency: 'USD' });

    expect(usdDto.toDTO().currency).toBe('USD');
    expect(usdDto.toDTO().deposits).toEqual({ amount: 999, count: 1 });
  });

  it('quando sem data usa o dia atual (UTC)', async () => {
    const deps = setup();
    const dto = await createUseCase(deps).execute();
    expect(dto.toDTO().date).toBe(new Date().toISOString().slice(0, 10));
    expect(dto.toDTO().deposits).toEqual({ amount: 0, count: 0 });
  });

  it('rejeita datas inválidas', async () => {
    const deps = setup();
    await expect(createUseCase(deps).execute({ date: 'not-a-date' })).rejects.toMatchObject({
      code: 'INVALID_DATE',
      statusCode: 400,
    });
    await expect(createUseCase(deps).execute({ date: '2024-13-40' })).rejects.toMatchObject({
      code: 'INVALID_DATE',
      statusCode: 400,
    });
  });
});