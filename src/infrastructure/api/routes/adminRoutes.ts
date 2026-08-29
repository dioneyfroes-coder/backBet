import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  AuthenticatedRequest,
  protectedRoute,
  requireAdminRole,
} from '../middleware/AuthMiddleware';
import {
  createBetRepository,
  createEventRepository,
  createRiskRepository,
  createWalletRepository,
  createHouseTreasuryRepository,
  createLedgerRepository,
  createUserRepository,
  createWithdrawalRequestRepository,
} from '@/infrastructure/persistence/factory';
import { AdminController } from '../controllers/AdminController';
import { IBetRepository } from '@core/betting/domain/repositories/IBetRepository';
import { IEventRepository } from '@core/betting/domain/repositories/IEventRepository';
import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { IWalletRepository } from '@core/finance/domain/repositories/IWalletRepository';
import { ILedgerRepository } from '@core/finance/domain/repositories/ILedgerRepository';
import { IUserRepository } from '@core/user/domain/repositories/IUserRepository';
import { IWithdrawalRequestRepository } from '@/core/finance/domain/repositories/IWithdrawalRequestRepository';
import { UserService } from '@core/user/domain/services/UserService';
import { WalletService } from '@core/finance/domain/services/WalletService';
import { BetService } from '@core/betting/domain/services/BetService';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { EventCatalogService } from '@core/betting/domain/services/EventCatalogService';
import { ResolveBetUseCase } from '@core/betting/application/use-cases/ResolveBetUseCase';
import { UpdateEventStatusUseCase } from '@core/betting/application/use-cases/UpdateEventStatusUseCase';
import { TreasuryController } from '../controllers/TreasuryController';
import { IHouseTreasuryRepository } from '@/core/treasury/domain/repositories/IHouseTreasuryRepository';
import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { GetTreasurySummary } from '@/core/treasury/application/use-cases/GetTreasurySummary';
import { GetTreasuryLedger } from '@/core/treasury/application/use-cases/GetTreasuryLedger';
import { RecordTreasuryProfit } from '@/core/treasury/application/use-cases/RecordTreasuryProfit';
import { TransferProfitToPrize } from '@/core/treasury/application/use-cases/TransferProfitToPrize';
import { TransferPrizeToProfit } from '@/core/treasury/application/use-cases/TransferPrizeToProfit';
import { RebalanceTreasury } from '@/core/treasury/application/use-cases/RebalanceTreasury';
import { ReconcileTreasury } from '@/core/treasury/application/use-cases/ReconcileTreasury';
import { appConfig } from '@/shared/config/appConfig';
import { idempotencyService } from '@/shared/services/IdempotencyService';
import { AuditService } from '@/core/audit/domain/services/AuditService';
import { IAuditEventRepository } from '@/core/audit/domain/repositories/IAuditEventRepository';
import { createAuditEventRepository } from '@/infrastructure/persistence/factory';
import { AuditController } from '../controllers/AuditController';
import { SigapController } from '../controllers/SigapController';
import { SigapService } from '@/core/sigap/domain/services/SigapService';
import { TransmitSigapFile } from '@/core/sigap/application/use-cases/TransmitSigapFile';
import { GetSigapSubmissions } from '@/core/sigap/application/use-cases/GetSigapSubmissions';
import { GetSigapSubmission } from '@/core/sigap/application/use-cases/GetSigapSubmission';
import { CheckSigapImpediment } from '@/core/sigap/application/use-cases/CheckSigapImpediment';
import { GetDailyFinancialSummary } from '@/core/reports/application/use-cases/GetDailyFinancialSummary';
import { ISigapSubmissionRepository } from '@/core/sigap/domain/repositories/ISigapSubmissionRepository';
import { createSigapSubmissionRepository } from '@/infrastructure/persistence/factory';
import { createSigapProviders } from '@/infrastructure/sigap/sigapFactory';

export type AdminRoutesDeps = {
  betRepository?: IBetRepository;
  eventRepository?: IEventRepository;
  riskRepository?: IRiskRepository;
  walletRepository?: IWalletRepository;
  ledgerRepository?: ILedgerRepository;
  houseTreasuryRepository?: IHouseTreasuryRepository;
  auditRepository?: IAuditEventRepository;
  sigapSubmissionRepository?: ISigapSubmissionRepository;
  userRepository?: IUserRepository;
  withdrawalRepository?: IWithdrawalRequestRepository;
  dependencyHealthProvider?: () => Record<'redis' | 'mongo', number>;
};

export async function createAdminRoutes(deps: AdminRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const betRepository: IBetRepository = deps.betRepository ?? (await createBetRepository());
  const eventRepository: IEventRepository = deps.eventRepository ?? (await createEventRepository());
  const walletRepository: IWalletRepository =
    deps.walletRepository ?? (await createWalletRepository());
  const ledgerRepository: ILedgerRepository =
    deps.ledgerRepository ?? (await createLedgerRepository());
  const riskRepository: IRiskRepository = deps.riskRepository ?? (await createRiskRepository());
  const houseTreasuryRepository: IHouseTreasuryRepository =
    deps.houseTreasuryRepository ?? (await createHouseTreasuryRepository());
  const userRepository: IUserRepository = deps.userRepository ?? (await createUserRepository());
  const withdrawalRepository: IWithdrawalRequestRepository =
    deps.withdrawalRepository ?? (await createWithdrawalRequestRepository());

  const walletService = new WalletService(walletRepository, ledgerRepository);
  const riskService = new RiskService(riskRepository, betRepository);
  const eventCatalogService = new EventCatalogService(eventRepository);
  const betService = new BetService(betRepository, eventRepository, walletService, riskService);
  const userService = new UserService(userRepository);
  const treasuryService = new HouseTreasuryService(houseTreasuryRepository, {
    walletId: appConfig.treasury.walletId,
    currency: appConfig.treasury.currency,
  });

  const auditRepository: IAuditEventRepository =
    deps.auditRepository ?? (await createAuditEventRepository());
  const auditService = new AuditService(auditRepository);
  const auditController = new AuditController(auditService, appConfig.audit.retentionDays);

  if (appConfig.sigap.enabled) {
    const sigapSubmissionRepository: ISigapSubmissionRepository =
      deps.sigapSubmissionRepository ?? (await createSigapSubmissionRepository());
    const sigapProviders = createSigapProviders();
    const sigapService = new SigapService({
      submissionRepository: sigapSubmissionRepository,
      transmissionProvider: sigapProviders.transmission,
      impedimentProvider: sigapProviders.impediment,
    });
    const sigap = new SigapController(
      new TransmitSigapFile(sigapService),
      new GetSigapSubmissions(sigapService),
      new GetSigapSubmission(sigapService),
      new CheckSigapImpediment(sigapService),
      auditService,
    );

    router.post(
      '/sigap/transmit',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req: AuthenticatedRequest, res) => sigap.transmit(req, res)),
    );
    router.get(
      '/sigap/submissions',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req: AuthenticatedRequest, res) => sigap.querySubmissions(req, res)),
    );
    router.get(
      '/sigap/submissions/:id',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req: AuthenticatedRequest, res) => sigap.getSubmission(req, res)),
    );
    router.post(
      '/sigap/impediment',
      protectedRoute,
      requireAdminRole,
      asyncHandler((req: AuthenticatedRequest, res) => sigap.checkImpediment(req, res)),
    );
  }

  const adminController = new AdminController(
    new ResolveBetUseCase(betService, idempotencyService),
    new UpdateEventStatusUseCase(eventCatalogService),
    riskService,
    eventCatalogService,
    deps.dependencyHealthProvider,
    auditService,
    userService,
    walletRepository,
    betRepository,
    withdrawalRepository,
    ledgerRepository,
    new GetDailyFinancialSummary({
      ledgerRepository,
      betRepository,
      riskRepository,
      treasuryRepository: houseTreasuryRepository,
      treasuryWalletId: appConfig.treasury.walletId,
      defaultCurrency: appConfig.treasury.currency,
    }),
  );
  const treasuryController = new TreasuryController(
    new GetTreasurySummary(treasuryService),
    new GetTreasuryLedger(treasuryService),
    new RecordTreasuryProfit(treasuryService),
    new TransferProfitToPrize(treasuryService),
    new TransferPrizeToProfit(treasuryService),
    new ReconcileTreasury(treasuryService),
    new RebalanceTreasury(treasuryService),
  );

  // Admin endpoints
  router.get(
    '/overview',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.getOverview(req, res)),
  );

  // Fase 28 — Administração: consultas e bloqueio de usuário
  router.get(
    '/users/:userId',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.getUser(req, res)),
  );

  router.get(
    '/users/:userId/wallet',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.getUserWallet(req, res)),
  );

  router.get(
    '/users/:userId/bets',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.getUserBets(req, res)),
  );

  router.get(
    '/users/:userId/withdrawals',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.getUserWithdrawals(req, res)),
  );

  router.get(
    '/users/:userId/ledger',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.getUserLedger(req, res)),
  );

  router.post(
    '/users/:userId/block',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.blockUser(req, res)),
  );

  router.post(
    '/users/:userId/unblock',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.unblockUser(req, res)),
  );

  router.get(
    '/bets/:betId',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.getBet(req, res)),
  );

  router.get(
    '/withdrawals/:requestId',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.getWithdrawal(req, res)),
  );

  router.get(
    '/risk/users/:userId',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.getRiskForUser(req, res)),
  );

  router.post(
    '/risk/users/:userId/reconcile',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.reconcileRiskForUser(req, res)),
  );

  router.post(
    '/bets/:betId/settle',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.settleBet(req, res)),
  );

  router.patch(
    '/events/:eventId/status',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => adminController.updateEventStatus(req, res)),
  );

  router.get(
    '/treasury/summary',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => treasuryController.getSummary(req, res)),
  );

  router.get(
    '/treasury/ledger',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => treasuryController.getLedger(req, res)),
  );

  router.post(
    '/treasury/profit',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => treasuryController.recordProfit(req, res)),
  );

  router.post(
    '/treasury/profit-to-prize',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) =>
      treasuryController.transferProfitToPrize(req, res),
    ),
  );

  router.post(
    '/treasury/prize-to-profit',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) =>
      treasuryController.transferPrizeToProfit(req, res),
    ),
  );

  router.post(
    '/treasury/rebalance',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => treasuryController.rebalance(req, res)),
  );

  router.post(
    '/treasury/reconcile',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => treasuryController.reconcile(req, res)),
  );

  router.get(
    '/audit/events',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => auditController.queryEvents(req, res)),
  );

  router.get(
    '/audit/events/:eventId',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => auditController.getEvent(req, res)),
  );

  router.post(
    '/audit/retention/apply',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => auditController.applyRetention(req, res)),
  );

  router.get(
    '/reports/daily-financial-summary',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) =>
      adminController.getDailyFinancialSummary(req, res),
    ),
  );

  return router;
}
