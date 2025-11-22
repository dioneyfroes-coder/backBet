import { Router } from 'express';
import { createAuthRoutes, AuthRoutesDeps } from './authRoutes';
import { createUserRoutes, UserRoutesDeps } from './userRoutes';
import { createWalletRoutes, WalletRoutesDeps } from './walletRoutes';
import { createBetRoutes, BetRoutesDeps } from './betRoutes';
import { createFinanceRoutes, FinanceRoutesDeps } from './financeRoutes';
import {
  createUserRepository,
  createWalletRepository,
  createBetRepository,
  createEventRepository,
  createCreditPackageRepository,
  createWithdrawalRequestRepository,
} from '@/infrastructure/persistence/factory';
import { ClerkService } from '@/shared/services/ClerkService';
import { JwtService } from '@/shared/services/JwtService';

export type ApiRoutesDeps = {
  auth?: AuthRoutesDeps;
  user?: UserRoutesDeps;
  wallet?: WalletRoutesDeps;
  bet?: BetRoutesDeps;
  finance?: FinanceRoutesDeps;
};

export async function createApiRouter(deps: ApiRoutesDeps = {}): Promise<Router> {
  const router = Router();
  const clerkService = new ClerkService();
  const jwtService = new JwtService();

  const userRepository = deps.auth?.userRepository || deps.user?.userRepository || (await createUserRepository());
  const walletRepository =
    deps.wallet?.walletRepository || deps.bet?.walletRepository || deps.finance?.walletRepository || (await createWalletRepository());
  const betRepository = deps.bet?.betRepository || (await createBetRepository());
  const eventRepository = deps.bet?.eventRepository || (await createEventRepository());
  const creditPackageRepository = deps.finance?.creditPackageRepository || (await createCreditPackageRepository());
  const withdrawalRequestRepository = deps.finance?.withdrawalRequestRepository || (await createWithdrawalRequestRepository());

  router.use('/auth', await createAuthRoutes({
    userRepository,
    walletRepository,
    clerkService,
    jwtService,
    ...(deps.auth || {}),
  }));
  router.use('/users', await createUserRoutes({
    userRepository,
    ...(deps.user || {}),
  }));
  router.use('/wallets', await createWalletRoutes({
    walletRepository,
    ...(deps.wallet || {}),
  }));
  router.use('/bets', await createBetRoutes({
    betRepository,
    eventRepository,
    walletRepository,
    ...(deps.bet || {}),
  }));
  router.use('/finance', await createFinanceRoutes({
    walletRepository,
    creditPackageRepository,
    withdrawalRequestRepository,
    ...(deps.finance || {}),
  }));

  return router;
}
