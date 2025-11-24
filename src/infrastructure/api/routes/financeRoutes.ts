import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { protectedRoute } from '../middleware/AuthMiddleware';
import { FinanceController } from '../controllers/FinanceController';
import { CreditPackageService } from '@/core/finance/domain/services/CreditPackageService';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { ListCreditPackages } from '@/core/finance/application/use-cases/ListCreditPackages';
import { PurchaseCreditPackage } from '@/core/finance/application/use-cases/PurchaseCreditPackage';
import { RequestWithdrawal } from '@/core/finance/application/use-cases/RequestWithdrawal';
import { GetWithdrawalRequests } from '@/core/finance/application/use-cases/GetWithdrawalRequests';
import { ProcessWithdrawalRequest } from '@/core/finance/application/use-cases/ProcessWithdrawalRequest';
import {
  createCreditPackageRepository,
  createWalletRepository,
  createWithdrawalRequestRepository,
} from '@/infrastructure/persistence/factory';
import { ICreditPackageRepository } from '@/core/finance/domain/repositories/ICreditPackageRepository';
import { IWithdrawalRequestRepository } from '@/core/finance/domain/repositories/IWithdrawalRequestRepository';
import { IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';

export type FinanceRoutesDeps = {
  walletRepository?: IWalletRepository;
  creditPackageRepository?: ICreditPackageRepository;
  withdrawalRequestRepository?: IWithdrawalRequestRepository;
};

export async function createFinanceRoutes(deps: FinanceRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const walletRepository = deps.walletRepository ?? (await createWalletRepository());
  const walletService = new WalletService(walletRepository as any);

  const creditPackageRepository =
    deps.creditPackageRepository ?? (await createCreditPackageRepository());
  const creditPackageService = new CreditPackageService(creditPackageRepository as any);

  const withdrawalRequestRepository =
    deps.withdrawalRequestRepository ?? (await createWithdrawalRequestRepository());
  const withdrawalRequestService = new WithdrawalRequestService(
    withdrawalRequestRepository as any,
    walletService,
  );

  const financeController = new FinanceController(
    new ListCreditPackages(creditPackageService),
    new PurchaseCreditPackage(creditPackageService, walletService),
    new RequestWithdrawal(withdrawalRequestService),
    new GetWithdrawalRequests(withdrawalRequestService),
    new ProcessWithdrawalRequest(withdrawalRequestService),
  );

  router.get(
    '/packages',
    protectedRoute,
    asyncHandler((req, res) => financeController.listPackages(req, res)),
  );
  router.post(
    '/packages/:packageId/purchase',
    protectedRoute,
    asyncHandler((req, res) => financeController.purchasePackage(req, res)),
  );
  router.post(
    '/withdrawal-requests',
    protectedRoute,
    asyncHandler((req, res) => financeController.createWithdrawalRequest(req, res)),
  );
  router.get(
    '/withdrawal-requests',
    protectedRoute,
    asyncHandler((req, res) => financeController.listWithdrawalRequests(req, res)),
  );
  router.patch(
    '/withdrawal-requests/:requestId',
    protectedRoute,
    asyncHandler((req, res) => financeController.processWithdrawal(req, res)),
  );

  return router;
}
