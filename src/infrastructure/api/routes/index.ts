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
import { IUserRepository } from '@/core/user/domain/repositories/IUserRepository';
import { IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';
import { IBetRepository } from '@/core/betting/domain/repositories/IBetRepository';
import { IEventRepository } from '@/core/betting/domain/repositories/IEventRepository';
import { ICreditPackageRepository } from '@/core/finance/domain/repositories/ICreditPackageRepository';
import { IWithdrawalRequestRepository } from '@/core/finance/domain/repositories/IWithdrawalRequestRepository';
import { AuthenticatedRequest } from '../middleware/AuthMiddleware';

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

  // SERVICES for lazy user creation
  const userService = new UserService(userRepository);
  const walletService = new WalletService(walletRepository);
  const registerUserUseCase = new RegisterUser(userService, walletService);

  // Middleware: lazy-create internal user when request authenticated by Clerk
  router.use(async (req: AuthenticatedRequest, _res, next) => {
    try {
      const ensureAuthContext = () => {
        if (!req.auth) {
          req.auth = {
            userId: '',
            sessionId: 'clerk-session',
          };
        }
        return req.auth;
      };

      const authUserId = req.auth?.userId;
      if (!authUserId) return next();

      // Try to fetch Clerk user
      const clerk = await clerkService.getUser(authUserId);
      if (!clerk) return next();

      // If Clerk user already has internalUserId in publicMetadata, ensure req.auth points to it
      const metadataValue = clerk.publicMetadata?.internalUserId;
      const internalIdFromMetadata = typeof metadataValue === 'string' ? metadataValue : undefined;
      if (internalIdFromMetadata) {
        ensureAuthContext().userId = internalIdFromMetadata;
        return next();
      }

      // Try to find by email
      const email =
        clerk.emailAddresses?.[0]?.emailAddress || clerk.primaryEmailAddress?.emailAddress;
      if (email) {
        const existing = await userRepository.findByEmail(email);
        if (existing) {
          ensureAuthContext().userId = existing.id;
          // Link back to Clerk for future requests
          if (clerk.id && clerkService.isEnabled()) {
            await clerkService.linkInternalUserId(clerk.id, existing.id);
          }
          return next();
        }
      }

      // Lazy create: construct reasonable username (do NOT save a local password)
      const usernameCandidate =
        clerk.username || (email ? email.split('@')[0] : `user-${randomUUID().slice(0, 8)}`);

      // Execute registration to create internal user + wallet without a local password
      const result = await registerUserUseCase.execute({
        email: email || `${usernameCandidate}@example.internal`,
        username: usernameCandidate,
        currency: 'BRL',
      });

      // Link clerk user publicMetadata with internal id if possible
      if (clerk.id && clerkService.isEnabled()) {
        await clerkService.linkInternalUserId(clerk.id, result.user.id);
      }

      // Ensure downstream handlers see internal user id
      ensureAuthContext().userId = result.user.id;
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
