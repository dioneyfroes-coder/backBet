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
import { RegisterUser } from '@/core/user/application/use-cases/RegisterUser';
import { UserService } from '@/core/user/domain/services/UserService';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { randomUUID } from 'crypto';

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

  const userRepository =
    deps.auth?.userRepository || deps.user?.userRepository || (await createUserRepository());
  const walletRepository =
    deps.wallet?.walletRepository ||
    deps.bet?.walletRepository ||
    deps.finance?.walletRepository ||
    (await createWalletRepository());
  const betRepository = deps.bet?.betRepository || (await createBetRepository());
  const eventRepository = deps.bet?.eventRepository || (await createEventRepository());
  const creditPackageRepository =
    deps.finance?.creditPackageRepository || (await createCreditPackageRepository());
  const withdrawalRequestRepository =
    deps.finance?.withdrawalRequestRepository || (await createWithdrawalRequestRepository());

  // SERVICES for lazy user creation
  const userService = new UserService(userRepository as any);
  const walletService = new WalletService(walletRepository as any);
  const registerUserUseCase = new RegisterUser(userService, walletService);

  // Middleware: lazy-create internal user when request authenticated by Clerk
  router.use(async (req, _res, next) => {
    try {
      const authUserId = (req as any).auth?.userId;
      if (!authUserId) return next();

      // Try to fetch Clerk user
      const clerk = await clerkService.getUser(authUserId);
      if (!clerk) return next();

      // If Clerk user already has internalUserId in publicMetadata, ensure req.auth points to it
      const internalIdFromMetadata = (clerk as any)?.publicMetadata?.internalUserId;
      if (internalIdFromMetadata) {
        (req as any).auth.userId = internalIdFromMetadata;
        return next();
      }

      // Try to find by email
      const email =
        (clerk as any)?.emailAddresses?.[0]?.emailAddress ||
        (clerk as any)?.primaryEmailAddress?.emailAddress;
      if (email) {
        const existing = await userRepository.findByEmail(email);
        if (existing) {
          (req as any).auth.userId = existing.id;
          // Link back to Clerk for future requests
          if (clerk.id && clerkService.isEnabled()) {
            await clerkService.linkInternalUserId(clerk.id, existing.id);
          }
          return next();
        }
      }

      // Lazy create: construct reasonable username (do NOT save a local password)
      const usernameCandidate =
        (clerk as any)?.username ||
        (email ? email.split('@')[0] : `user-${randomUUID().slice(0, 8)}`);

      // Execute registration to create internal user + wallet without a local password
      const result = await registerUserUseCase.execute({
        email: email || `${usernameCandidate}@example.internal`,
        username: usernameCandidate,
      });

      // Link clerk user publicMetadata with internal id if possible
      if (clerk.id && clerkService.isEnabled()) {
        await clerkService.linkInternalUserId(clerk.id, result.user.id);
      }

      // Ensure downstream handlers see internal user id
      (req as any).auth.userId = result.user.id;
    } catch (err) {
      console.warn('Lazy user middleware error:', err);
    } finally {
      next();
    }
  });

  router.use(
    '/auth',
    await createAuthRoutes({
      userRepository,
      walletRepository,
      clerkService,
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
    '/finance',
    await createFinanceRoutes({
      walletRepository,
      creditPackageRepository,
      withdrawalRequestRepository,
      ...(deps.finance || {}),
    }),
  );

  return router;
}
