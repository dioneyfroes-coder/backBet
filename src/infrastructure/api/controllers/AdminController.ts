import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ResolveBetUseCase } from '@core/betting/application/use-cases/ResolveBetUseCase';
import { UpdateEventStatusUseCase } from '@core/betting/application/use-cases/UpdateEventStatusUseCase';
import { RiskService } from '@/core/risk/domain/services/RiskService';
import { EventCatalogService } from '@core/betting/domain/services/EventCatalogService';
import { UserService } from '@core/user/domain/services/UserService';
import { IWalletRepository } from '@core/finance/domain/repositories/IWalletRepository';
import { IBetRepository } from '@core/betting/domain/repositories/IBetRepository';
import { IWithdrawalRequestRepository } from '@/core/finance/domain/repositories/IWithdrawalRequestRepository';
import { ILedgerRepository } from '@core/finance/domain/repositories/ILedgerRepository';
import { SettleBetDTO, SettleBetDTOType } from '../dtos/AdminDTOs';
import { UpdateEventStatusDTO, UpdateEventStatusDTOType } from '../dtos/EventDTOs';
import { appConfig } from '@/shared/config/appConfig';
import { getObservabilityToggles } from '@/shared/observability/featureToggles';
import { flushEventOddsCache } from '@/infrastructure/cache/cacheHooks';
import { AuditService } from '@/core/audit/domain/services/AuditService';
import { getRequestContext } from '@/shared/observability/requestContext';
import { AppError } from '@/shared/errors/AppError';

export class AdminController extends BaseController {
  constructor(
    private readonly resolveBetUseCase: ResolveBetUseCase,
    private readonly updateEventStatusUseCase: UpdateEventStatusUseCase,
    private readonly riskService: RiskService,
    private readonly eventCatalogService: EventCatalogService,
    private readonly dependencyHealthProvider?: () => Record<'redis' | 'mongo', number>,
    private readonly auditService?: AuditService,
    private readonly userService?: UserService,
    private readonly walletRepository?: IWalletRepository,
    private readonly betRepository?: IBetRepository,
    private readonly withdrawalRepository?: IWithdrawalRequestRepository,
    private readonly ledgerRepository?: ILedgerRepository,
  ) {
    super();
  }

  private auditAdminAction(req: Request, input: {
    action: string;
    resourceType: string;
    resourceId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason?: string;
  }): void {
    if (!this.auditService) {
      return;
    }
    const ctx = getRequestContext();
    const ip =
      req.ip ||
      (Array.isArray(req.headers['x-forwarded-for'])
        ? req.headers['x-forwarded-for'][0]
        : req.headers['x-forwarded-for']?.split(',')[0].trim());
    void this.auditService
      .recordAdminAction({
        actorUserId:
          (req as Request & { authContext?: { userId?: string } }).authContext?.userId || 'unknown',
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        before: input.before,
        after: input.after,
        reason: input.reason,
        ip,
        requestId: (req as Request & { id?: string }).id || ctx?.requestId,
      })
      .catch(() => undefined);
  }

  /**
   * @openapi
   * /api/admin/overview:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Visão geral do backoffice
   *     responses:
   *       '200':
   *         description: Status e limites administrativos
   */
  async getOverview(_req: Request, res: Response) {
    return this.ok(res, {
      service: {
        appName: appConfig.project.appName,
        serviceName: appConfig.project.serviceName,
        env: appConfig.runtime.env,
      },
      observability: getObservabilityToggles(),
      risk: {
        maxExposurePerUser: this.riskService.getMaxExposure(),
      },
      dependencies: this.dependencyHealthProvider ? this.dependencyHealthProvider() : null,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * @openapi
   * /api/admin/risk/users/{userId}:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Consulta exposição de risco de um usuário
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Dados de risco do usuário
   */
  async getRiskForUser(req: Request, res: Response) {
    try {
      const exposure = await this.riskService.getExposureForUser(req.params.userId);
      return this.ok(res, {
        userId: req.params.userId,
        exposure,
        maxExposure: this.riskService.getMaxExposure(),
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/risk/users/{userId}/reconcile:
   *   post:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Reconcilia a exposição de risco de um usuário (estado operacional vs histórico de apostas)
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Resultado da reconciliação
   */
  async reconcileRiskForUser(req: Request, res: Response) {
    try {
      const result = await this.riskService.reconcileUserRisk(req.params.userId);
      this.auditAdminAction(req, {
        action: 'risk.user.reconcile',
        resourceType: 'user',
        resourceId: req.params.userId,
        after: { result },
        reason: 'Administrative risk reconciliation',
      });
      return this.ok(res, result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/bets/{betId}/settle:
   *   post:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Liquida manualmente uma aposta
   *     parameters:
   *       - in: path
   *         name: betId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               result:
   *                 type: string
   *                 enum: [WON, LOST]
   *               marketResult:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Aposta liquidada
   */
  async settleBet(req: Request, res: Response) {
    try {
      const payload = this.validateSchema(SettleBetDTO, req.body) as SettleBetDTOType;
      const idempotencyKey = typeof req.get === 'function'
        ? req.get('Idempotency-Key') ?? undefined
        : undefined;
      const bet = idempotencyKey
        ? await this.resolveBetUseCase.execute(
            {
              betId: req.params.betId,
              result: payload.result,
              marketResult: payload.marketResult,
            },
            idempotencyKey,
          )
        : await this.resolveBetUseCase.execute({
            betId: req.params.betId,
            result: payload.result,
            marketResult: payload.marketResult,
          });
      this.auditAdminAction(req, {
        action: 'bet.settle',
        resourceType: 'bet',
        resourceId: req.params.betId,
        after: { result: payload.result, marketResult: payload.marketResult },
        reason: 'Administrative bet settlement',
      });
      return this.ok(res, bet.toJSON());
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/events/{eventId}/status:
   *   patch:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Atualiza status de um evento
   *     parameters:
   *       - in: path
   *         name: eventId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               action:
   *                 type: string
   *                 enum: [START, FINISH, CANCEL]
   *     responses:
   *       '200':
   *         description: Evento atualizado
   */
    async updateEventStatus(req: Request, res: Response) {
    try {
      const payload = this.validateSchema(
        UpdateEventStatusDTO,
        req.body,
      ) as UpdateEventStatusDTOType;
      const event = await this.updateEventStatusUseCase.execute(req.params.eventId, payload.action);
      await flushEventOddsCache(event.id).catch((error) =>
        console.warn('Failed to flush cache after event status update', error),
      );
      this.auditAdminAction(req, {
        action: 'event.status',
        resourceType: 'event',
        resourceId: req.params.eventId,
        after: { action: payload.action },
        reason: 'Administrative event status update',
      });
      return this.ok(res, event.toJSON());
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  // ---------- Fase 28 — Administração: consultas e bloqueio ----------

  private parsePagination(query: Request['query']): { limit: number; offset: number } {
    const rawLimit = Number(query.limit);
    const rawOffset = Number(query.offset);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 20;
    const maxLimit = Math.min(limit, 200);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
    return { limit: maxLimit, offset };
  }

  /**
   * @openapi
   * /api/admin/users/{userId}:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Consulta um usuário (visão administrativa, sem hash de senha)
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Dados do usuário
   *       '404':
   *         description: Usuário não encontrado
   */
  async getUser(req: Request, res: Response) {
    try {
      if (!this.userService) {
        throw new AppError('ADMIN_NOT_CONFIGURED', 'Usuário de administração não configurado', 500);
      }
      const user = await this.userService.findById(req.params.userId);
      if (!user) {
        return this.notFound(res, 'Usuário não encontrado');
      }
      return this.ok(res, { user: user.toDTO() });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/users/{userId}/wallet:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Consulta a carteira de um usuário
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Carteira do usuário
   *       '404':
   *         description: Carteira não encontrada
   */
  async getUserWallet(req: Request, res: Response) {
    try {
      if (!this.walletRepository) {
        throw new AppError('ADMIN_NOT_CONFIGURED', 'Admin de carteira não configurado', 500);
      }
      const wallet = await this.walletRepository.findByUserId(req.params.userId);
      if (!wallet) {
        return this.notFound(res, 'Carteira não encontrada');
      }
      return this.ok(res, { wallet: wallet.toDTO() });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/users/{userId}/bets:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Lista as apostas de um usuário
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Apostas do usuário
   */
  async getUserBets(req: Request, res: Response) {
    try {
      if (!this.betRepository) {
        throw new AppError('ADMIN_NOT_CONFIGURED', 'Admin de apostas não configurado', 500);
      }
      const { limit, offset } = this.parsePagination(req.query);
      const all = await this.betRepository.findByUserId(req.params.userId);
      const ordered = [...all].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const page = ordered.slice(offset, offset + limit);
      return this.ok(res, {
        bets: page.map((bet) => bet.toJSON()),
        pagination: { total: ordered.length, limit, offset },
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/bets/{betId}:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Consulta uma aposta específica
   *     parameters:
   *       - in: path
   *         name: betId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Aposta
   *       '404':
   *         description: Aposta não encontrada
   */
  async getBet(req: Request, res: Response) {
    try {
      if (!this.betRepository) {
        throw new AppError('ADMIN_NOT_CONFIGURED', 'Admin de apostas não configurado', 500);
      }
      const bet = await this.betRepository.findById(req.params.betId);
      if (!bet) {
        return this.notFound(res, 'Aposta não encontrada');
      }
      return this.ok(res, { bet: bet.toJSON() });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/users/{userId}/withdrawals:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Lista os saques (retiradas) de um usuário
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Saques do usuário
   */
  async getUserWithdrawals(req: Request, res: Response) {
    try {
      if (!this.withdrawalRepository) {
        throw new AppError('ADMIN_NOT_CONFIGURED', 'Admin de saques não configurado', 500);
      }
      const { limit, offset } = this.parsePagination(req.query);
      const all = await this.withdrawalRepository.findByUserId(req.params.userId);
      const ordered = [...all].sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
      const page = ordered.slice(offset, offset + limit);
      return this.ok(res, {
        withdrawals: page.map((w) => w.toDTO()),
        pagination: { total: ordered.length, limit, offset },
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/withdrawals/{requestId}:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Consulta um saque (retirada) específico
   *     parameters:
   *       - in: path
   *         name: requestId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Saque
   *       '404':
   *         description: Saque não encontrado
   */
  async getWithdrawal(req: Request, res: Response) {
    try {
      if (!this.withdrawalRepository) {
        throw new AppError('ADMIN_NOT_CONFIGURED', 'Admin de saques não configurado', 500);
      }
      const withdrawal = await this.withdrawalRepository.findById(req.params.requestId);
      if (!withdrawal) {
        return this.notFound(res, 'Saque não encontrado');
      }
      return this.ok(res, { withdrawal: withdrawal.toDTO() });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/users/{userId}/ledger:
   *   get:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Consulta o ledger financeiro de um usuário (inclui depósitos, apostas, prêmios, saques)
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Movimentações financeiras do usuário
   */
  async getUserLedger(req: Request, res: Response) {
    try {
      if (!this.ledgerRepository) {
        throw new AppError('ADMIN_NOT_CONFIGURED', 'Admin de ledger não configurado', 500);
      }
      const { limit, offset } = this.parsePagination(req.query);
      const entries = await this.ledgerRepository.findByUserId(req.params.userId, { limit, offset });
      const all = await this.ledgerRepository.findByUserId(req.params.userId);
      return this.ok(res, {
        entries: entries.map((entry) => entry.toDTO()),
        pagination: { total: all.length, limit, offset },
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/users/{userId}/block:
   *   post:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Bloqueia (suspende) um usuário
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               reason:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Usuário bloqueado
   */
  async blockUser(req: Request, res: Response) {
    try {
      if (!this.userService) {
        throw new AppError('ADMIN_NOT_CONFIGURED', 'Usuário de administração não configurado', 500);
      }
      const before = await this.userService.findById(req.params.userId);
      await this.userService.suspendUser(req.params.userId);
      const after = await this.userService.findById(req.params.userId);
      this.auditAdminAction(req, {
        action: 'user.block',
        resourceType: 'user',
        resourceId: req.params.userId,
        before: before ? { status: before.status } : undefined,
        after: after ? { status: after.status } : undefined,
        reason: (req.body as { reason?: string } | undefined)?.reason || 'Administrative block',
      });
      return this.ok(res, {
        userId: req.params.userId,
        status: after?.status,
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/admin/users/{userId}/unblock:
   *   post:
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     summary: Desbloqueia (reativa) um usuário
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               reason:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Usuário desbloqueado
   */
  async unblockUser(req: Request, res: Response) {
    try {
      if (!this.userService) {
        throw new AppError('ADMIN_NOT_CONFIGURED', 'Usuário de administração não configurado', 500);
      }
      const before = await this.userService.findById(req.params.userId);
      await this.userService.activateUser(req.params.userId);
      const after = await this.userService.findById(req.params.userId);
      this.auditAdminAction(req, {
        action: 'user.unblock',
        resourceType: 'user',
        resourceId: req.params.userId,
        before: before ? { status: before.status } : undefined,
        after: after ? { status: after.status } : undefined,
        reason: (req.body as { reason?: string } | undefined)?.reason || 'Administrative unblock',
      });
      return this.ok(res, {
        userId: req.params.userId,
        status: after?.status,
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}
