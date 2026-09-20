import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { PixWebhookController } from '../controllers/PixWebhookController';
import { WalletService } from '@core/finance/domain/services/WalletService';
import {
  createWalletRepository,
  createLedgerRepository,
} from '@/infrastructure/persistence/factory';
import { ProcessPixWebhook } from '@core/finance/application/use-cases/ProcessPixWebhook';
import { IWalletRepository } from '@core/finance/domain/repositories/IWalletRepository';
import { ILedgerRepository } from '@core/finance/domain/repositories/ILedgerRepository';
import { PixProviderPort } from '@/core/finance/domain/ports/PixProviderPort';
import { createPixProvider } from '@/infrastructure/payments/pix';
import { idempotencyService } from '@/infrastructure/persistence/idempotencyFactory';
import { coreMetrics } from '@/infrastructure/observability/coreMetrics';

export type PixWebhookRoutesDeps = {
  walletRepository?: IWalletRepository;
  ledgerRepository?: ILedgerRepository;
  pixProvider?: PixProviderPort;
};

/**
 * Rota PÚBLICA de webhook Pix. A autenticação é feita pela assinatura HMAC
 * no header `X-BackBet-Signature` (validada dentro de `ProcessPixWebhook`) —
 * NÃO usa `protectedRoute`.
 */
export async function createPixWebhookRoutes(
  deps: PixWebhookRoutesDeps = {},
): Promise<Router> {
  const router = Router();

  const walletRepository: IWalletRepository =
    deps.walletRepository ?? (await createWalletRepository());
  const ledgerRepository: ILedgerRepository =
    deps.ledgerRepository ?? (await createLedgerRepository());
  const pixProvider: PixProviderPort = deps.pixProvider ?? (await createPixProvider());

  const walletService = new WalletService(walletRepository, ledgerRepository, coreMetrics);
  const processPixWebhook = new ProcessPixWebhook(
    walletService,
    pixProvider,
    idempotencyService,
  );
  const pixWebhookController = new PixWebhookController(processPixWebhook);

  router.post(
    '/pix',
    asyncHandler((req, res) => pixWebhookController.receivePixWebhook(req, res)),
  );

  return router;
}