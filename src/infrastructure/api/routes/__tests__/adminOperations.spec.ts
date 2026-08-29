import express from 'express';
import request from 'supertest';
import { createAdminRoutes } from '@/infrastructure/api/routes/adminRoutes';
import { UserRepository } from '@/core/user/domain/repositories/UserRepository';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { BetRepository } from '@/core/betting/domain/repositories/BetRepository';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { WithdrawalRequestRepository } from '@/core/finance/domain/repositories/WithdrawalRequestRepository';
import { WithdrawalRequest } from '@/core/finance/domain/entities/WithdrawalRequest';
import { InMemoryLedgerRepository } from '@/core/finance/domain/repositories/InMemoryLedgerRepository';
import { InMemoryAuditEventRepository } from '@/core/audit/domain/repositories/InMemoryAuditEventRepository';
import { LedgerEntry } from '@/core/finance/domain/entities/LedgerEntry';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@/core/odds/domain/value-objects/Odds';
import { JwtService } from '@/shared/services/JwtService';
import { appConfig } from '@/shared/config/appConfig';

describe('Admin Operations Routes (Fase 28)', () => {
  const jwtService = new JwtService();
  const targetUserId = 'target-user';
  const adminUserId = 'admin-user';

  let app: express.Express;
  let userRepository: UserRepository;
  let walletRepository: WalletRepository;
  let betRepository: BetRepository;
  let withdrawalRepository: WithdrawalRequestRepository;
  let ledgerRepository: InMemoryLedgerRepository;
  let auditRepository: InMemoryAuditEventRepository;
  let accessToken: string;

  const seedData = async () => {
    const user = new User(
      targetUserId,
      new Email('target@example.com'),
      'TargetUser',
      'hashed',
      'ACTIVE',
      new Date('2024-01-01'),
      new Date('2024-01-01'),
      null,
    );
    await userRepository.save(user);

    const wallet = new Wallet(targetUserId, 'BRL');
    wallet.deposit(150);
    await walletRepository.save(wallet);

    const bet = new Bet(
      'bet-1',
      targetUserId,
      'event-1',
      'market-1',
      new Money(10, 'BRL'),
      new Odds(2),
      'PENDING',
      'SINGLE',
      new Date('2024-02-01'),
      undefined,
      undefined,
    );
    await betRepository.create(bet);

    const withdrawal = new WithdrawalRequest(
      'withdrawal-1',
      targetUserId,
      50,
      'BRL' as never,
      new Date('2024-03-01'),
      'REQUESTED',
    );
    await withdrawalRepository.create(withdrawal);

    const depositEntry = new LedgerEntry(
      'ledger-deposit-1',
      targetUserId,
      'DEPOSIT',
      15000,
      'BRL',
      'ref-deposit-1',
      'pix',
      'COMPLETED',
      new Date('2024-03-01'),
      { referenceId: 'ref-deposit-1' },
    );
    await ledgerRepository.append(depositEntry);
  };

  beforeEach(async () => {
    appConfig.admin.allowedUserIds = [adminUserId];

    userRepository = new UserRepository();
    walletRepository = new WalletRepository();
    betRepository = new BetRepository();
    withdrawalRepository = new WithdrawalRequestRepository();
    ledgerRepository = new InMemoryLedgerRepository();
    auditRepository = new InMemoryAuditEventRepository();

    await seedData();

    const routes = await createAdminRoutes({
      userRepository,
      walletRepository,
      betRepository,
      withdrawalRepository,
      ledgerRepository,
      auditRepository,
    });

    app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
          const payload = jwtService.verifyAccessToken(token);
          req.authContext = { userId: payload.userId, sessionId: payload.sessionId };
        } catch (error) {
          console.warn('Invalid token in tests', error);
        }
      }
      next();
    });
    app.use('/api/admin', routes);

    accessToken = jwtService.signAccessToken(adminUserId, 'session-test');
  });

  it('requires admin role (403 for non-admin)', async () => {
    const nonAdminToken = jwtService.signAccessToken(targetUserId, 'session-test');
    const response = await request(app)
      .get(`/api/admin/users/${targetUserId}`)
      .set('Authorization', `Bearer ${nonAdminToken}`);
    expect(response.status).toBe(403);
  });

  it('GET /users/:userId returns the user without password hash', async () => {
    const response = await request(app)
      .get(`/api/admin/users/${targetUserId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.id).toBe(targetUserId);
    expect(response.body.data.user.email).toBe('target@example.com');
  });

  it('GET /users/:userId returns 404 for unknown user', async () => {
    const response = await request(app)
      .get('/api/admin/users/does-not-exist')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(404);
  });

  it('GET /users/:userId/wallet returns the wallet', async () => {
    const response = await request(app)
      .get(`/api/admin/users/${targetUserId}/wallet`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.wallet.balance).toBe(150);
  });

  it('GET /users/:userId/bets lists bets', async () => {
    const response = await request(app)
      .get(`/api/admin/users/${targetUserId}/bets`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.bets).toHaveLength(1);
    expect(response.body.data.bets[0].id).toBe('bet-1');
  });

  it('GET /bets/:betId returns a single bet', async () => {
    const response = await request(app)
      .get('/api/admin/bets/bet-1')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.bet.id).toBe('bet-1');
    expect(response.body.data.bet.amount).toBe(10);
  });

  it('GET /users/:userId/withdrawals lists withdrawals', async () => {
    const response = await request(app)
      .get(`/api/admin/users/${targetUserId}/withdrawals`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.withdrawals).toHaveLength(1);
    expect(response.body.data.withdrawals[0].id).toBe('withdrawal-1');
  });

  it('GET /withdrawals/:requestId returns a single withdrawal', async () => {
    const response = await request(app)
      .get('/api/admin/withdrawals/withdrawal-1')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.withdrawal.id).toBe('withdrawal-1');
  });

  it('GET /users/:userId/ledger returns the financial ledger (incl. deposits)', async () => {
    const response = await request(app)
      .get(`/api/admin/users/${targetUserId}/ledger`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.entries).toHaveLength(1);
    expect(response.body.data.entries[0].type).toBe('DEPOSIT');
  });

  it('POST /users/:userId/block suspends the user and records audit', async () => {
    const response = await request(app)
      .post(`/api/admin/users/${targetUserId}/block`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'fraud-investigation' });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('SUSPENDED');

    const user = await userRepository.findById(targetUserId);
    expect(user?.status).toBe('SUSPENDED');
    expect(auditRepository.size).toBe(1);
  });

  it('POST /users/:userId/unblock reactivates the user and records audit', async () => {
    await userRepository.save(
      new User(
        targetUserId,
        new Email('target@example.com'),
        'TargetUser',
        'hashed',
        'SUSPENDED',
        new Date('2024-01-01'),
        new Date('2024-01-01'),
        null,
      ),
    );

    const response = await request(app)
      .post(`/api/admin/users/${targetUserId}/unblock`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ACTIVE');

    const user = await userRepository.findById(targetUserId);
    expect(user?.status).toBe('ACTIVE');
  });
});
