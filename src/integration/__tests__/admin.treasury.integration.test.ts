import request from 'supertest';
import express, { Router, RequestHandler } from 'express';
import { createApiServer } from '@/infrastructure/api/ApiServer';
import { TreasuryController } from '@/infrastructure/api/controllers/TreasuryController';
import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { HouseTreasuryRepository } from '@/core/treasury/domain/repositories/HouseTreasuryRepository';
import { GetTreasurySummary } from '@/core/treasury/application/use-cases/GetTreasurySummary';
import { GetTreasuryLedger } from '@/core/treasury/application/use-cases/GetTreasuryLedger';
import { RecordTreasuryProfit } from '@/core/treasury/application/use-cases/RecordTreasuryProfit';
import { TransferProfitToPrize } from '@/core/treasury/application/use-cases/TransferProfitToPrize';
import { TransferPrizeToProfit } from '@/core/treasury/application/use-cases/TransferPrizeToProfit';
import { RebalanceTreasury } from '@/core/treasury/application/use-cases/RebalanceTreasury';
import { asyncHandler } from '@/infrastructure/api/middleware/asyncHandler';
import {
  AuthenticatedRequest,
  protectedRoute,
  requireAdminRole,
} from '@/infrastructure/api/middleware/AuthMiddleware';
import { appConfig } from '@/shared/config/appConfig';

describe('Admin Treasury routes', () => {
  let app: express.Express;
  const adminUserId = 'admin-e2e';

  const impersonateAdmin: RequestHandler = (req, _res, next) => {
    (req as AuthenticatedRequest).authContext = {
      userId: adminUserId,
      sessionId: 'test-session',
    };
    next();
  };

  const buildServer = () => {
    appConfig.admin.allowedUserIds = [adminUserId];
    appConfig.treasury.targetPrizeRatio = 0.5;
    appConfig.treasury.minProfitBuffer = 1_000;
    appConfig.treasury.maxTransferPerRun = 50_000;

    const treasuryService = new HouseTreasuryService(new HouseTreasuryRepository(), {
      walletId: appConfig.treasury.walletId,
      currency: appConfig.treasury.currency,
    });

    const controller = new TreasuryController(
      new GetTreasurySummary(treasuryService),
      new GetTreasuryLedger(treasuryService),
      new RecordTreasuryProfit(treasuryService),
      new TransferProfitToPrize(treasuryService),
      new TransferPrizeToProfit(treasuryService),
      new RebalanceTreasury(treasuryService),
    );

    const router = Router();
    router.use(impersonateAdmin);

    router.get(
      '/treasury/summary',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req, res) => controller.getSummary(req, res)),
    );

    router.get(
      '/treasury/ledger',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req, res) => controller.getLedger(req, res)),
    );

    router.post(
      '/treasury/profit',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req, res) => controller.recordProfit(req, res)),
    );

    router.post(
      '/treasury/rebalance',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req, res) => controller.rebalance(req, res)),
    );

    const server = createApiServer(0);
    server.registerRoutes(router, '/admin');
    server.registerErrorHandler();
    server.get404Handler();

    app = server.getExpressApp();
  };

  beforeEach(() => {
    buildServer();
  });

  it('returns treasury summary with zero balances by default', async () => {
    const res = await request(app).get('/api/admin/treasury/summary');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary.profitBalance).toBe(0);
    expect(res.body.data.summary.prizeReserveBalance).toBe(0);
  });

  it('records profit and rebalances funds', async () => {
    const profitRes = await request(app)
      .post('/api/admin/treasury/profit')
      .send({ amount: 20_000, description: 'seed capital' });

    expect(profitRes.status).toBe(200);
    expect(profitRes.body.data.summary.profitBalance).toBe(20_000);

    const rebalanceRes = await request(app)
      .post('/api/admin/treasury/rebalance')
      .send({ targetPrizeRatio: 0.4, minProfitBuffer: 1_000, maxTransfer: 10_000 });

    expect(rebalanceRes.status).toBe(200);
    expect(rebalanceRes.body.data.result.direction).toBe('PROFIT_TO_RESERVE');
    expect(rebalanceRes.body.data.summary.prizeReserveBalance).toBeGreaterThan(0);
  });
});
