import { BetService } from '../BetService';
import { Bet } from '../../entities/Bet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@core/odds/domain/value-objects/Odds';
import { Event, Market } from '../../entities/Event';
import { TransactionRunner } from '@/core/shared/types/Transaction';
import { InMemoryRiskRepository } from '@/infrastructure/persistence/inmemory/repositories/InMemoryRiskRepository';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { RiskProfile } from '@/core/risk/domain/entities/RiskProfile';
import { DomainError } from '@/core/shared/domain/errors/DomainError';

const makeEvent = (status: 'SCHEDULED' | 'LIVE' | 'FINISHED' = 'SCHEDULED') =>
  new Event(
    'event-1',
    'Championship',
    new Date(),
    status,
    'Football',
    ['Team A', 'Team B'],
    new Map([
      ['market-a', new Market('market-a', 'Winner', 'OPEN', new Map([['odd-a', new Odds(2.4)]]))],
    ]),
  );

const makeBet = (): Bet =>
  new Bet(
    'bet-1',
    'user-1',
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

describe('BetService', () => {
  const betRepository = {
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
    findByEventId: jest.fn(),
  } as any;
  const eventRepository = {
    findById: jest.fn(),
  } as any;
  const walletService = {
    withdraw: jest.fn(),
    deposit: jest.fn(),
  } as any;
  const service = new BetService(betRepository, eventRepository, walletService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('placeBet', () => {
    it('uses one transaction session for wallet debit and bet creation', async () => {
      const session = { id: 'bet-transaction' };
      const transactionRunner: TransactionRunner = {
        withTransaction: jest.fn(async <T>(work: (session: unknown) => Promise<T>) => work(session)),
      };
      const transactionalService = new BetService(
        betRepository,
        eventRepository,
        walletService,
        undefined,
        transactionRunner,
      );
      eventRepository.findById.mockResolvedValue(makeEvent());
      walletService.withdraw.mockResolvedValue({ currency: 'BRL', userId: 'user-1' });

      await transactionalService.placeBet({
        userId: 'user-1',
        eventId: 'event-1',
        marketId: 'market-a',
        oddId: 'odd-a',
        amount: 100,
        type: 'SINGLE',
      });

      expect(transactionRunner.withTransaction).toHaveBeenCalledTimes(1);
      expect(walletService.withdraw).toHaveBeenCalledWith(
        'user-1',
        100,
        expect.objectContaining({ type: 'BET_DEBIT', source: 'BET' }),
        { session },
      );
      expect(betRepository.create).toHaveBeenCalledWith(expect.any(Bet), { session });
    });

    it('creates a bet when event, market and odds exist', async () => {
      eventRepository.findById.mockResolvedValue(makeEvent());
      walletService.withdraw.mockResolvedValue({ currency: 'BRL', userId: 'user-1' });

      const bet = await service.placeBet({
        userId: 'user-1',
        eventId: 'event-1',
        marketId: 'market-a',
        oddId: 'odd-a',
        amount: 100,
        type: 'SINGLE',
      });

      expect(walletService.withdraw).toHaveBeenCalledWith(
        'user-1',
        100,
        expect.objectContaining({ type: 'BET_DEBIT', source: 'BET' }),
      );
      expect(betRepository.create).toHaveBeenCalled();
      expect(bet.status).toBe('PENDING');
    });

    it('throws when event is missing or closed', async () => {
      eventRepository.findById.mockResolvedValue(null);
      await expect(
        service.placeBet({
          userId: 'user-1',
          eventId: 'missing',
          marketId: 'market-a',
          oddId: 'odd-a',
          amount: 10,
          type: 'SINGLE',
        }),
      ).rejects.toThrow('Event not found');

      eventRepository.findById.mockResolvedValue(makeEvent('LIVE'));
      await expect(
        service.placeBet({
          userId: 'user-1',
          eventId: 'event-1',
          marketId: 'market-a',
          oddId: 'odd-a',
          amount: 10,
          type: 'SINGLE',
        }),
      ).rejects.toThrow('Event is not open for betting');
    });

    it('throws when market or odd are missing or closed', async () => {
      const event = makeEvent();
      event.markets.delete('market-a');
      eventRepository.findById.mockResolvedValue(event);

      await expect(
        service.placeBet({
          userId: 'user-1',
          eventId: 'event-1',
          marketId: 'market-a',
          oddId: 'odd-a',
          amount: 10,
          type: 'SINGLE',
        }),
      ).rejects.toThrow('Market not found');

      event.markets.set('market-a', new Market('market-a', 'Winner', 'SUSPENDED', new Map()));
      await expect(
        service.placeBet({
          userId: 'user-1',
          eventId: 'event-1',
          marketId: 'market-a',
          oddId: 'odd-a',
          amount: 10,
          type: 'SINGLE',
        }),
      ).rejects.toThrow('Market is not open for betting');
    });

    it('throws when odds are missing', async () => {
      const event = makeEvent();
      event.markets.get('market-a')?.odds.clear();
      eventRepository.findById.mockResolvedValue(event);

      await expect(
        service.placeBet({
          userId: 'user-1',
          eventId: 'event-1',
          marketId: 'market-a',
          oddId: 'odd-missing',
          amount: 10,
          type: 'SINGLE',
        }),
      ).rejects.toThrow('Odd not found');
    });
  });

  describe('cancelBet', () => {
    it('reverts pending bet and returns funds', async () => {
      const bet = makeBet();
      betRepository.findById.mockResolvedValue(bet);
      eventRepository.findById.mockResolvedValue(makeEvent());

      const result = await service.cancelBet({
        betId: bet.id,
        reason: 'user requested',
        canceledBy: 'admin-1',
      });

      expect(result.status).toBe('CANCELED');
      expect(walletService.deposit).toHaveBeenCalledWith(
        'user-1',
        bet.amount.amount,
        expect.objectContaining({ type: 'BET_REFUND', source: 'BET' }),
      );
      expect(betRepository.update).toHaveBeenCalledWith(result);
    });

    it('throws when bet is not pending or event not scheduled', async () => {
      const bet = makeBet();
      bet.resolve('WON');
      betRepository.findById.mockResolvedValue(bet);
      await expect(
        service.cancelBet({ betId: bet.id, reason: 'too late', canceledBy: 'admin-1' }),
      ).rejects.toThrow('Only pending bets can be canceled.');

      const pendingBet = makeBet();
      betRepository.findById.mockResolvedValue(pendingBet);
      eventRepository.findById.mockResolvedValue(makeEvent('LIVE'));
      await expect(
        service.cancelBet({ betId: pendingBet.id, reason: 'live event', canceledBy: 'admin-1' }),
      ).rejects.toThrow('Cannot cancel bet on ongoing or finished event');
    });
  });

  describe('resolveBet', () => {
    it('wins and credits wallet, losses skip deposit', async () => {
      const bet = makeBet();
      betRepository.findById.mockResolvedValue(bet);
      const result = await service.resolveBet({
        betId: bet.id,
        result: 'WON',
        marketResult: 'Team A',
      });

      expect(result.status).toBe('WON');
      expect(walletService.deposit).toHaveBeenCalledWith(
        'user-1',
        bet.potentialReturn,
        expect.objectContaining({ type: 'BET_WIN', source: 'BET' }),
      );

      walletService.deposit.mockClear();

      const lostBet = makeBet();
      betRepository.findById.mockResolvedValue(lostBet);
      const lostResult = await service.resolveBet({
        betId: lostBet.id,
        result: 'LOST',
        marketResult: 'Team B',
      });

      expect(lostResult.status).toBe('LOST');
      expect(walletService.deposit).not.toHaveBeenCalled();
    });

    it('throws when bet is missing or already resolved', async () => {
      betRepository.findById.mockResolvedValue(null);
      await expect(
        service.resolveBet({ betId: 'missing', result: 'WON', marketResult: 'Team A' }),
      ).rejects.toThrow('Bet not found');

      const bet = makeBet();
      bet.resolve('WON');
      betRepository.findById.mockResolvedValue(bet);
      await expect(
        service.resolveBet({ betId: bet.id, result: 'WON', marketResult: 'Team A' }),
      ).rejects.toThrow('Only pending bets can be resolved.');
    });
  });

  it('forwards list requests', async () => {
    betRepository.findByUserId.mockResolvedValue([makeBet()]);
    betRepository.findByEventId.mockResolvedValue([makeBet()]);

    expect(await service.getUserBets('user-1')).toHaveLength(1);
    expect(await service.getEventBets('event-1')).toHaveLength(1);
  });

  describe('placeBet exposure atomicity', () => {
    it('allows only the bets that fit within the exposure limit under concurrency', async () => {
      const riskRepository = new InMemoryRiskRepository();
      // limit 300 BRL = 30000 cents
      await riskRepository.upsert(new RiskProfile('user-9', 0, 30000));
      const riskService = new RiskService(riskRepository);

      const localBetRepository = { ...betRepository } as any;
      localBetRepository.create = jest.fn().mockResolvedValue(undefined);
      localBetRepository.findById = jest.fn();
      localBetRepository.findByUserId = jest.fn().mockResolvedValue([]);

      const localWallet = { ...walletService } as any;
      localWallet.withdraw = jest.fn().mockResolvedValue({ currency: 'BRL', userId: 'user-9' });

      const session = { id: 'risk-tx' };
      const transactionRunner: TransactionRunner = {
        withTransaction: jest.fn(async <T>(work: (s: unknown) => Promise<T>) => work(session)),
      };
      const service = new BetService(
        localBetRepository,
        eventRepository,
        localWallet,
        riskService,
        transactionRunner,
      );

      eventRepository.findById.mockResolvedValue(makeEvent());

      const place = () =>
        service
          .placeBet({
            userId: 'user-9',
            eventId: 'event-1',
            marketId: 'market-a',
            oddId: 'odd-a',
            amount: 100, // liability at odds 2.4 = 140 BRL = 14000 cents
            type: 'SINGLE',
          })
          .then(() => 'ok' as const)
          .catch((e: DomainError) => e.code);

      const results = await Promise.all(Array.from({ length: 10 }, () => place()));
      const ok = results.filter((r) => r === 'ok').length;
      const limitExceeded = results.filter((r) => r === 'RISK_LIMIT_EXCEEDED').length;

      // exactly the bets that fit within the limit succeed, the rest fail atomically
      expect(ok).toBe(2);
      expect(ok + limitExceeded).toBe(10);
      // final exposure stays within the configured limit (280 BRL)
      expect(await riskService.getExposureForUser('user-9')).toBe(280);
    });
  });
});
