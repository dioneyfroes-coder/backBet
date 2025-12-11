import { Router, Response, NextFunction } from 'express';
import { createAuthRoutes, AuthRoutesDeps } from './authRoutes';
import { createUserRoutes, UserRoutesDeps } from './userRoutes';
import { createWalletRoutes, WalletRoutesDeps } from './walletRoutes';
import { createBetRoutes, BetRoutesDeps } from './betRoutes';
import { createFinanceRoutes, FinanceRoutesDeps } from './financeRoutes';
import { createBaseRoutes, BaseRoutesDeps } from './baseRoutes';
import { createEventRoutes, EventRoutesDeps } from './eventRoutes';
import { createAdminRoutes, AdminRoutesDeps } from './adminRoutes';
import { createGameRoutes, GameRoutesDeps } from './gameRoutes';
import { createContactRoutes } from './contactRoutes';
import {
  createUserRepository,
  createWalletRepository,
  createBetRepository,
  createEventRepository,
  createCreditPackageRepository,
  createWithdrawalRequestRepository,
  createRiskRepository,
} from '@/infrastructure/persistence/factory';
import { JwtService } from '@/shared/services/JwtService';
import { IUserRepository } from '@/core/user/domain/repositories/IUserRepository';
import { IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';
import { IBetRepository } from '@/core/betting/domain/repositories/IBetRepository';
import { IEventRepository } from '@/core/betting/domain/repositories/IEventRepository';
import { ICreditPackageRepository } from '@/core/finance/domain/repositories/ICreditPackageRepository';
import { IWithdrawalRequestRepository } from '@/core/finance/domain/repositories/IWithdrawalRequestRepository';
import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';

export type ApiRoutesDeps = {
  base?: BaseRoutesDeps;
  auth?: AuthRoutesDeps;
  user?: UserRoutesDeps;
  wallet?: WalletRoutesDeps;
  bet?: BetRoutesDeps;
  finance?: FinanceRoutesDeps;
  events?: EventRoutesDeps;
  admin?: AdminRoutesDeps;
  games?: GameRoutesDeps;
};

export async function createApiRouter(deps: ApiRoutesDeps = {}): Promise<Router> {
  const router = Router();
  const jwtService = new JwtService();

  const userRepository: IUserRepository =
    deps.auth?.userRepository || deps.user?.userRepository || (await createUserRepository());
  const walletRepository: IWalletRepository =
    deps.wallet?.walletRepository ||
    deps.bet?.walletRepository ||
    deps.finance?.walletRepository ||
    (await createWalletRepository());
  const betRepository: IBetRepository = deps.bet?.betRepository || (await createBetRepository());
  const eventRepository: IEventRepository =
    deps.bet?.eventRepository || (await createEventRepository());
  const creditPackageRepository: ICreditPackageRepository =
    deps.finance?.creditPackageRepository || (await createCreditPackageRepository());
  const withdrawalRequestRepository: IWithdrawalRequestRepository =
    deps.finance?.withdrawalRequestRepository || (await createWithdrawalRequestRepository());
  const riskRepository: IRiskRepository =
    deps.admin?.riskRepository || (await createRiskRepository());

  router.use('/', createBaseRoutes(deps.base ?? {}));

  router.use(
    '/auth',
    await createAuthRoutes({
      userRepository,
      walletRepository,
      jwtService,
      ...(deps.auth || {}),
    }),
  );
  router.use(
    '/users',
    await createUserRoutes({
      userRepository,
      ...(deps.user || {}),
    }),
  );
  router.use(
    '/wallets',
    await createWalletRoutes({
      walletRepository,
      ...(deps.wallet || {}),
    }),
  );
  router.use(
    '/bets',
    await createBetRoutes({
      betRepository,
      eventRepository,
      walletRepository,
      ...(deps.bet || {}),
    }),
  );
  router.use(
    '/events',
    await createEventRoutes({
      eventRepository,
      ...(deps.events || {}),
    }),
  );
  router.use(
    '/finance',
    await createFinanceRoutes({
      walletRepository,
      creditPackageRepository,
      withdrawalRequestRepository,
      ...(deps.finance || {}),
    }),
  );
  router.use(
    '/games',
    await createGameRoutes({
      walletRepository,
      ...(deps.games || {}),
    }),
  );
  // Public contact endpoint
  router.use('/contact', await createContactRoutes());
  router.use(
    '/admin',
    await createAdminRoutes({
      ...(deps.admin || {}),
      betRepository: deps.admin?.betRepository ?? betRepository,
      eventRepository: deps.admin?.eventRepository ?? eventRepository,
      walletRepository: deps.admin?.walletRepository ?? walletRepository,
      riskRepository,
      dependencyHealthProvider:
        deps.admin?.dependencyHealthProvider ?? deps.base?.dependencyHealthProvider,
    }),
  );

  return router;
}
