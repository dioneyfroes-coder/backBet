import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AuthenticatedRequest, protectedRoute, requireAdminRole } from '../middleware/AuthMiddleware';
import { FinanceController } from '../controllers/FinanceController';
import { CreditPackageService } from '@/core/finance/domain/services/CreditPackageService';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { createWithdrawalQueue } from '@/infrastructure/withdrawals/withdrawalQueueFactory';
import { ListCreditPackages } from '@/core/finance/application/use-cases/ListCreditPackages';
import { PurchaseCreditPackage } from '@/core/finance/application/use-cases/PurchaseCreditPackage';
import { RequestWithdrawal } from '@/core/finance/application/use-cases/RequestWithdrawal';
import { GetWithdrawalRequests } from '@/core/finance/application/use-cases/GetWithdrawalRequests';
import { ProcessWithdrawalRequest } from '@/core/finance/application/use-cases/ProcessWithdrawalRequest';
import {
  createCreditPackageRepository,
  createWalletRepository,
  createWithdrawalRequestRepository,
  createUserRepository,
  createLedgerRepository,
} from '@/infrastructure/persistence/factory';
import { ICreditPackageRepository } from '@/core/finance/domain/repositories/ICreditPackageRepository';
import { IWithdrawalRequestRepository } from '@/core/finance/domain/repositories/IWithdrawalRequestRepository';
import { IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';
import { ILedgerRepository } from '@/core/finance/domain/repositories/ILedgerRepository';
import { IUserRepository } from '@/core/user/domain/repositories/IUserRepository';
import { UserService } from '@/core/user/domain/services/UserService';
import { idempotencyService } from '@/shared/services/IdempotencyService';

export type FinanceRoutesDeps = {
  walletRepository?: IWalletRepository;
  ledgerRepository?: ILedgerRepository;
  creditPackageRepository?: ICreditPackageRepository;
  withdrawalRequestRepository?: IWithdrawalRequestRepository;
  userRepository?: IUserRepository;
};

export async function createFinanceRoutes(deps: FinanceRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const walletRepository: IWalletRepository =
    deps.walletRepository ?? (await createWalletRepository());
  const ledgerRepository: ILedgerRepository =
    deps.ledgerRepository ?? (await createLedgerRepository());
  const walletService = new WalletService(walletRepository, ledgerRepository);

  const creditPackageRepository: ICreditPackageRepository =
    deps.creditPackageRepository ?? (await createCreditPackageRepository());
  const creditPackageService = new CreditPackageService(creditPackageRepository);

  const withdrawalRequestRepository: IWithdrawalRequestRepository =
    deps.withdrawalRequestRepository ?? (await createWithdrawalRequestRepository());
  const withdrawalQueue = await createWithdrawalQueue();
  const withdrawalRequestService = new WithdrawalRequestService(
    withdrawalRequestRepository,
    walletService,
    withdrawalQueue,
  );

  const userRepository: IUserRepository = deps.userRepository ?? (await createUserRepository());
  const userService = new UserService(userRepository);

  const financeController = new FinanceController(
    new ListCreditPackages(creditPackageService),
    new PurchaseCreditPackage(creditPackageService, walletService, idempotencyService),
    new RequestWithdrawal(withdrawalRequestService, userService, idempotencyService),
    new GetWithdrawalRequests(withdrawalRequestService),
    new ProcessWithdrawalRequest(withdrawalRequestService),
  );

  router.get(
    '/packages',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res) => financeController.listPackages(req, res)),
  );
  router.post(
    '/packages/:packageId/purchase',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res) => financeController.purchasePackage(req, res)),
  );
  router.post(
    '/withdrawal-requests',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res) =>
      financeController.createWithdrawalRequest(req, res),
    ),
  );
  router.get(
    '/withdrawal-requests',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res) =>
      financeController.listWithdrawalRequests(req, res),
    ),
  );
  router.patch(
    '/withdrawal-requests/:requestId',
    protectedRoute,
    requireAdminRole,
    asyncHandler((req: AuthenticatedRequest, res) => financeController.processWithdrawal(req, res)),
  );

  return router;
}
