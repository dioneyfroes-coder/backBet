import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AuthenticatedRequest, protectedRoute } from '../middleware/AuthMiddleware';
import { cacheUserProfileMiddleware } from '../middleware/cacheMiddleware';
import { UserController } from '../controllers/UserController';
import { UserService } from '@core/user/domain/services/UserService';
import { createUserRepository } from '@/infrastructure/persistence/factory';
import { GetUserProfile } from '@core/user/application/use-cases/GetUserProfile';
import { UpdateProfile } from '@core/user/application/use-cases/UpdateProfile';
import { ChangeEmail } from '@core/user/application/use-cases/ChangeEmail';
import { UpdatePixKey } from '@core/user/application/use-cases/UpdatePixKey';
import { AddUserDocument } from '@core/user/application/use-cases/AddUserDocument';
import { LocalStorageAdapter } from '@/infrastructure/storage/LocalStorageAdapter';
import { createUploadMiddleware } from '../middleware/uploadMiddleware';
import { IUserRepository } from '@core/user/domain/repositories/IUserRepository';
import { IIdentityVerificationRepository } from '@core/compliance/domain/repositories/IIdentityVerificationRepository';
import { IResponsibleGamblingRepository } from '@core/responsibleGambling/domain/repositories/IResponsibleGamblingRepository';
import { ComplianceService } from '@core/compliance/domain/services/ComplianceService';
import { ComplianceController } from '../controllers/ComplianceController';
import { VerifyUserIdentity } from '@core/compliance/application/use-cases/VerifyUserIdentity';
import { GetIdentityVerification } from '@core/compliance/application/use-cases/GetIdentityVerification';
import { GetResponsibleGamblingProfile } from '@core/responsibleGambling/application/use-cases/GetResponsibleGamblingProfile';
import { UpdateResponsibleGamblingSettings } from '@core/responsibleGambling/application/use-cases/UpdateResponsibleGamblingSettings';
import {
  createIdentityVerificationRepository,
  createResponsibleGamblingRepository,
} from '@/infrastructure/persistence/factory';
import { createComplianceProviders } from '@/infrastructure/compliance/complianceFactory';
import type { ComplianceProviders } from '@/infrastructure/compliance/complianceFactory';

/**
 * Factory para criar rotas de usuário com injeção de dependências
 */
export type UserRoutesDeps = {
  userRepository?: IUserRepository;
  identityVerificationRepository?: IIdentityVerificationRepository;
  responsibleGamblingRepository?: IResponsibleGamblingRepository;
  complianceProviders?: ComplianceProviders;
};

export async function createUserRoutes(deps: UserRoutesDeps = {}): Promise<Router> {
  const router = Router();

  const userRepository: IUserRepository = deps.userRepository ?? (await createUserRepository());
  const userService = new UserService(userRepository);

  // Compliance (KYC) + jogo responsável — deps opcionais, compartilhadas com
  // as rotas financeiras/apostas quando injetadas em testes (mesma instância).
  const identityVerificationRepository: IIdentityVerificationRepository =
    deps.identityVerificationRepository ?? (await createIdentityVerificationRepository());
  const responsibleGamblingRepository: IResponsibleGamblingRepository =
    deps.responsibleGamblingRepository ?? (await createResponsibleGamblingRepository());
  const complianceProviders: ComplianceProviders =
    deps.complianceProviders ?? createComplianceProviders();

  const complianceService = new ComplianceService(
    identityVerificationRepository,
    complianceProviders.kyc,
    complianceProviders.geolocation,
    complianceProviders.deviceIntegrity,
  );
  const responsibleGamblingService = new (
    await import('@core/responsibleGambling/domain/services/ResponsibleGamblingService')
  ).ResponsibleGamblingService(responsibleGamblingRepository);

  const getIdentityVerificationUseCase = new GetIdentityVerification(complianceService);
  const verifyUserIdentityUseCase = new VerifyUserIdentity(complianceService);
  const getResponsibleGamblingUseCase = new GetResponsibleGamblingProfile(
    responsibleGamblingService,
  );
  const updateResponsibleGamblingUseCase = new UpdateResponsibleGamblingSettings(
    responsibleGamblingService,
  );

  const complianceController = new ComplianceController(
    getIdentityVerificationUseCase,
    verifyUserIdentityUseCase,
    getResponsibleGamblingUseCase,
    updateResponsibleGamblingUseCase,
  );

  // Use-cases
  const getUserProfileUseCase = new GetUserProfile(userService);
  const updateProfileUseCase = new UpdateProfile(userService);
  const changeEmailUseCase = new ChangeEmail(userService);
  const updatePixKeyUseCase = new UpdatePixKey(userService);
  const addUserDocumentUseCase = new AddUserDocument(userService);
  const getPreferencesUseCase = new (
    await import('@core/user/application/use-cases/GetPreferences')
  ).GetPreferences(userService);
  const updatePreferencesUseCase = new (
    await import('@core/user/application/use-cases/UpdatePreferences')
  ).UpdatePreferences(userService);

  const userController = new UserController(
    getUserProfileUseCase,
    updateProfileUseCase,
    changeEmailUseCase,
    updatePixKeyUseCase,
    addUserDocumentUseCase,
    getPreferencesUseCase,
    updatePreferencesUseCase,
  );

  const storageAdapter = new LocalStorageAdapter();
  const uploadMiddleware = createUploadMiddleware(storageAdapter, 'document');

  // Rotas protegidas
  router.get(
    '/me',
    protectedRoute,
    cacheUserProfileMiddleware,
    asyncHandler((req: AuthenticatedRequest, res) => userController.getMe(req, res)),
  );

  router.patch(
    '/me',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res) => userController.updateProfile(req, res)),
  );

  router.patch(
    '/me/email',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res) => userController.changeEmail(req, res)),
  );

  router.get(
    '/me/pix-key',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res: Response) => userController.getPixKey(req, res)),
  );

  router.put(
    '/me/pix-key',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res: Response) =>
      userController.updatePixKey(req, res),
    ),
  );

  router.post(
    '/me/documents',
    protectedRoute,
    uploadMiddleware,
    asyncHandler((req: AuthenticatedRequest, res: Response) =>
      userController.uploadDocument(req, res),
    ),
  );

  router.get(
    '/me/preferences',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res: Response) =>
      userController.getPreferences(req, res),
    ),
  );

  router.put(
    '/me/preferences',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res: Response) =>
      userController.updatePreferences(req, res),
    ),
  );

  router.get(
    '/me/identity-verification',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res: Response) =>
      complianceController.getIdentityVerification(req, res),
    ),
  );

  router.post(
    '/me/identity-verification',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res: Response) =>
      complianceController.verifyIdentity(req, res),
    ),
  );

  router.get(
    '/me/responsible-gambling',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res: Response) =>
      complianceController.getResponsibleGambling(req, res),
    ),
  );

  router.patch(
    '/me/responsible-gambling',
    protectedRoute,
    asyncHandler((req: AuthenticatedRequest, res: Response) =>
      complianceController.updateResponsibleGambling(req, res),
    ),
  );

  return router;
}
