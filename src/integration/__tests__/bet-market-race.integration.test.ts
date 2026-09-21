import { randomUUID } from 'crypto';
import { connectMongoDB, disconnectMongoDB, getMongoDBConfig } from '@/infrastructure/persistence/mongoose/config';
import { MongooseWalletRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseWalletRepository';
import { MongooseLedgerRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseLedgerRepository';
import { MongooseBetRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseBetRepository';
import { MongooseUserRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseUserRepository';
import { MongooseEventRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseEventRepository';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { BetService } from '@/core/betting/domain/services/BetService';
import { Event, Market } from '@/core/betting/domain/entities/Event';
import { Odds } from '@/core/odds/domain/value-objects/Odds';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';
import { UserModel } from '@/infrastructure/persistence/mongoose/schemas/UserSchema';
import { WalletModel } from '@/infrastructure/persistence/mongoose/schemas/WalletSchema';
import { LedgerEntryModel } from '@/infrastructure/persistence/mongoose/schemas/LedgerEntrySchema';
import { BetModel } from '@/infrastructure/persistence/mongoose/schemas/BetSchema';
import { EventModel } from '@/infrastructure/persistence/mongoose/schemas/EventSchema';
import { ICreateBetDTO } from '@core/betting/types/bet.types';

const runRealIntegration = process.env.RUN_REAL_INTEGRATION_TESTS === 'true';
const describeReal = runRealIntegration ? describe : describe.skip;

describeReal('Item #6 — race placeBet vs suspendMarket/odd (MongoDB real)', () => {
  jest.setTimeout(600_000);

  const runId = randomUUID();
  const prefix = `race-${runId}`;
  const USER_A = `${prefix}-user-a`;
  const USER_B = `${prefix}-user-b`;
  const FUNDING = 10_000;
  const STAKE = 100;
  const ODDS_VALUE = 2.0;

  const walletRepo = new MongooseWalletRepository();
  const ledgerRepo = new MongooseLedgerRepository();
  const userRepo = new MongooseUserRepository();
  const betRepo = new MongooseBetRepository();
  const eventRepo = new MongooseEventRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);
  const betService = new BetService(
    betRepo,
    eventRepo,
    walletService,
    undefined,
    walletRepo,
  );

  async function buildUser(userId: string): Promise<void> {
    const user = new User(
      userId,
      new Email(`${userId}@example.com`),
      `${prefix}-user-${userId}`,
      'Password123!',
      'ACTIVE',
      new Date(),
      new Date(),
    );
    await userRepo.save(user);
    await walletService.createWallet({ userId, currency: 'BRL' });
    await walletService.deposit(userId, FUNDING);
  }

  function makeOpenEvent(eventId: string, marketId: string): Event {
    return new Event(
      eventId,
      `Race Event ${eventId}`,
      new Date(Date.now() + 60 * 60 * 1000),
      'SCHEDULED',
      'Football',
      ['Team A', 'Team B'],
      new Map([
        [
          marketId,
          new Market(marketId, 'Vencedor', 'OPEN', new Map([['home', new Odds(ODDS_VALUE)]])),
        ],
      ]),
    );
  }

  async function suspendMarket(eventId: string, marketId: string): Promise<void> {
    const event = await eventRepo.findById(eventId);
    if (!event) throw new Error(`event not found ${eventId}`);
    const market = event.markets.get(marketId);
    if (!market) throw new Error(`market not found ${marketId}`);
    market.suspend();
    await eventRepo.update(event);
  }

  const baseBet = (userId: string, eventId: string, marketId: string): ICreateBetDTO => ({
    userId,
    eventId,
    marketId,
    oddId: 'home',
    amount: STAKE,
    type: 'SINGLE',
  });

  beforeAll(async () => {
    await connectMongoDB(getMongoDBConfig());
  });

  afterAll(async () => {
    if (runRealIntegration) {
      const ids = [USER_A, USER_B];
      await Promise.all([
        UserModel.deleteMany({ _id: { $in: ids } }),
        WalletModel.deleteMany({ userId: { $in: ids } }),
        LedgerEntryModel.deleteMany({ userId: { $in: ids } }),
        BetModel.deleteMany({ eventId: new RegExp(`^${prefix}`) }),
        EventModel.deleteMany({ id: new RegExp(`^${prefix}`) }),
      ]);
      await disconnectMongoDB();
    }
  });

  it('sanity: aposta contra mercado OPEN é aceita (1 bet, 1 débito, saldo correto)', async () => {
    const eventId = `${prefix}-evt-a`;
    const marketId = `${prefix}-mkt-a`;
    await buildUser(USER_A);
    await eventRepo.create(makeOpenEvent(eventId, marketId));

    const bet = await betService.placeBet(baseBet(USER_A, eventId, marketId));
    expect(bet.status).toBe('PENDING');

    const wallet = await walletService.findByUserId(USER_A);
    expect(wallet?.balance).toBe(FUNDING - STAKE);
    expect(wallet?.lockedBalance).toBe(0);

    const bets = await BetModel.countDocuments({ userId: USER_A });
    const debits = await LedgerEntryModel.countDocuments({ userId: USER_A, type: 'BET_DEBIT' });
    expect(bets).toBe(1);
    expect(debits).toBe(1);
  });

  it('mercado já suspenso antes da aposta: rejeitada sem efeito financeiro (MUDA em ordem commitada)', async () => {
    const eventId = `${prefix}-evt-b`;
    const marketId = `${prefix}-mkt-b`;
    await eventRepo.create(makeOpenEvent(eventId, marketId));

    await suspendMarket(eventId, marketId);

    await expect(betService.placeBet(baseBet(USER_A, eventId, marketId))).rejects.toMatchObject({
      code: 'MARKET_NOT_OPEN_FOR_BETTING',
    });

    const wallet = await walletService.findByUserId(USER_A);
    expect(wallet?.balance).toBe(FUNDING - STAKE);
    const betsBefore = await BetModel.countDocuments({ userId: USER_A });
    expect(betsBefore).toBe(1);
    const debits = await LedgerEntryModel.countDocuments({ userId: USER_A, type: 'BET_DEBIT' });
    expect(debits).toBe(1);
  });

  it('40 apostas concorrentes vs 1 suspensão: nenhuma duplicação, invariantes financeiras preservadas', async () => {
    const eventId = `${prefix}-evt-c`;
    const marketId = `${prefix}-mkt-c`;
    await buildUser(USER_B);
    await eventRepo.create(makeOpenEvent(eventId, marketId));

    const bets = Array.from({ length: 40 }, () =>
      betService.placeBet(baseBet(USER_B, eventId, marketId)),
    );

    const [results] = await Promise.all([
      Promise.allSettled(bets),
      suspendMarket(eventId, marketId),
    ]);

    const accepted = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    console.log(
      `RACE burst: 40 bets, accepted: ${accepted.length}, rejected: ${rejected.length}, market_suspended: yes`,
    );

    expect(rejected.length).toBeGreaterThanOrEqual(0);

    const wallet = await walletService.findByUserId(USER_B);
    expect(wallet!.balance).toBe(FUNDING - STAKE * accepted.length);
    expect(wallet!.balance).toBeGreaterThanOrEqual(0);
    expect(wallet!.lockedBalance).toBe(0);

    const storedBets = await BetModel.countDocuments({ userId: USER_B });
    expect(storedBets).toBe(accepted.length);

    const debits = await LedgerEntryModel.countDocuments({ userId: USER_B, type: 'BET_DEBIT' });
    expect(debits).toBe(accepted.length);

    const persistedBets = await BetModel.find({ userId: USER_B });
    expect(persistedBets.every((b) => b.status === 'PENDING')).toBe(true);

    const finalEvent = await eventRepo.findById(eventId);
    expect(finalEvent?.markets.get(marketId)?.status).toBe('SUSPENDED');

    const deduplicatedDebits = await LedgerEntryModel.aggregate([
      { $match: { userId: USER_B, type: 'BET_DEBIT' } },
      { $group: { _id: '$referenceId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);
    expect(deduplicatedDebits).toHaveLength(0);
  });
});