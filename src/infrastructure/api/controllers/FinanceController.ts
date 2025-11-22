import { Response } from 'express';
import { BaseController } from './BaseController';
import { AuthenticatedRequest } from '../middleware/AuthMiddleware';
import {
  CreditPackagePurchaseDTO,
  CreateWithdrawalRequestDTO,
  ProcessWithdrawalRequestDTO,
  CreditPackageResponseDTO,
  WithdrawalRequestResponseDTO,
} from '../dtos/FinanceDTOs';
import { ListCreditPackages } from '@/core/finance/application/use-cases/ListCreditPackages';
import { PurchaseCreditPackage } from '@/core/finance/application/use-cases/PurchaseCreditPackage';
import { RequestWithdrawal } from '@/core/finance/application/use-cases/RequestWithdrawal';
import { GetWithdrawalRequests } from '@/core/finance/application/use-cases/GetWithdrawalRequests';
import { ProcessWithdrawalRequest } from '@/core/finance/application/use-cases/ProcessWithdrawalRequest';

export class FinanceController extends BaseController {
  constructor(
    private listCreditPackages: ListCreditPackages,
    private purchaseCreditPackage: PurchaseCreditPackage,
    private requestWithdrawal: RequestWithdrawal,
    private getWithdrawalRequests: GetWithdrawalRequests,
    private processWithdrawalRequest: ProcessWithdrawalRequest,
  ) {
    super();
  }

  async listPackages(_req: AuthenticatedRequest, res: Response): Promise<Response> {
    const packages = await this.listCreditPackages.execute();

    const payload = packages.map((creditPackage) =>
      CreditPackageResponseDTO.parse({
        ...creditPackage.toDTO(),
        createdAt: creditPackage.createdAt.toISOString(),
        updatedAt: creditPackage.updatedAt.toISOString(),
      })
    );

    return this.ok(res, payload);
  }

  async purchasePackage(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = req.auth?.userId;
    if (!userId) {
      return this.unauthorized(res);
    }

    const payload = this.validateSchema(CreditPackagePurchaseDTO, { packageId: req.params.packageId });
    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    const { creditPackage, wallet } = await this.purchaseCreditPackage.execute(userId, payload.packageId);

    return this.created(res, {
      message: 'Pacote de créditos adquirido com sucesso',
      wallet: wallet.toDTO(),
      creditPackage: CreditPackageResponseDTO.parse({
        ...creditPackage.toDTO(),
        createdAt: creditPackage.createdAt.toISOString(),
        updatedAt: creditPackage.updatedAt.toISOString(),
      }),
    });
  }

  async createWithdrawalRequest(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = req.auth?.userId;
    if (!userId) {
      return this.unauthorized(res);
    }

    const payload = this.validateSchema(CreateWithdrawalRequestDTO, req.body);
    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    const request = await this.requestWithdrawal.execute(userId, payload.amount, payload.currency, payload.notes);

    return this.created(res, {
      message: 'Solicitação de saque criada com sucesso',
      withdrawalRequest: WithdrawalRequestResponseDTO.parse({
        ...request.toDTO(),
        requestedAt: request.requestedAt.toISOString(),
        processedAt: request.processedAt ? request.processedAt.toISOString() : null,
        approvalLogs: request.approvalLogs.map((log) => ({
          ...log,
          createdAt: log.createdAt.toISOString(),
        })),
      }),
    });
  }

  async listWithdrawalRequests(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = req.auth?.userId;
    if (!userId) {
      return this.unauthorized(res);
    }

    const requests = await this.getWithdrawalRequests.execute(userId);
    const payload = requests.map((request) =>
      WithdrawalRequestResponseDTO.parse({
        ...request.toDTO(),
        requestedAt: request.requestedAt.toISOString(),
        processedAt: request.processedAt ? request.processedAt.toISOString() : null,
        approvalLogs: request.approvalLogs.map((log) => ({
          ...log,
          createdAt: log.createdAt.toISOString(),
        })),
      })
    );

    return this.ok(res, payload);
  }

  async processWithdrawal(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = req.auth?.userId;
    if (!userId) {
      return this.unauthorized(res);
    }

    const payload = this.validateSchema(ProcessWithdrawalRequestDTO, req.body);
    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    const processed = await this.processWithdrawalRequest.execute(req.params.requestId, userId, payload.action, payload.notes);

    return this.ok(res, {
      message: 'Solicitação atualizada',
      withdrawalRequest: WithdrawalRequestResponseDTO.parse({
        ...processed.toDTO(),
        requestedAt: processed.requestedAt.toISOString(),
        processedAt: processed.processedAt ? processed.processedAt.toISOString() : null,
        approvalLogs: processed.approvalLogs.map((log) => ({
          ...log,
          createdAt: log.createdAt.toISOString(),
        })),
      }),
    });
  }
}
