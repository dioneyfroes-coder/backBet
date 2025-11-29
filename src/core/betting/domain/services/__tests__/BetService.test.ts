import { BetService } from '../BetService';
import { Bet } from '../../entities/Bet';
import { BetAmount } from '../../value-objects/BetAmount';
import { Odds } from '@core/odds/domain/value-objects/Odds';
import { Event, Market } from '../../entities/Event';

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
    new BetAmount(100, 'BRL'),
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

      expect(walletService.withdraw).toHaveBeenCalledWith('user-1', 100);
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
      expect(walletService.deposit).toHaveBeenCalledWith('user-1', bet.amount.value);
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
      expect(walletService.deposit).toHaveBeenCalledWith('user-1', bet.potentialReturn);

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
});
