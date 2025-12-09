import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { AuthenticatedRequest, getRequestUserId } from '../middleware/AuthMiddleware';
import { DepositDTO, WithdrawDTO } from '../dtos/WalletDTOs';
import { GetWallet } from '@core/finance/application/use-cases/GetWallet';
import { Deposit } from '@core/finance/application/use-cases/Deposit';
import { Withdraw } from '@core/finance/application/use-cases/Withdraw';
import { GetHistory } from '@core/finance/application/use-cases/GetHistory';
import { flushWalletCache } from '@/infrastructure/cache/cacheHooks';
import { appConfig } from '@/shared/config/appConfig';
import { UserService } from '@core/user/domain/services/UserService';

/**
 * Controller de carteiras
 * Gerencia operações de depósito, saque e histórico
 */
export class WalletController extends BaseController {
  constructor(
    private getWalletUseCase: GetWallet,
    private depositUseCase: Deposit,
    private withdrawUseCase: Withdraw,
    private getHistoryUseCase: GetHistory,
    private userService: UserService,
  ) {
    super();
  }

  /**
   * @openapi
   * /api/wallets/me:
   *   get:
   *     tags:
   *       - Wallets
   *     security:
   *       - bearerAuth: []
   *     summary: Retorna a carteira do usuário autenticado
   *     responses:
   *       '200':
   *         description: Carteira encontrada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/WalletResponse'
   *       '401':
   *         description: Não autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/UnauthorizedError'
   *       '404':
   *         description: Carteira não encontrada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  async getMe(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    const wallet = await this.getWalletUseCase.execute(userId);
    if (!wallet) {
      return this.notFound(res, 'Carteira não encontrada');
    }

    const setHeader = (headers: Record<string, string>) => {
      if (typeof res.set === 'function') {
        res.set(headers);
        return;
      }
      if (typeof (res as Response).header === 'function') {
        (res as Response).header(headers);
      }
    };

    setHeader({
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    });

    return this.ok(res, {
      userId: wallet.userId,
      balance: wallet.balance,
      lockedBalance: wallet.lockedBalance,
      currency: wallet.currency,
    });
  }

  /**
   * @openapi
   * /api/wallets/deposit:
   *   post:
   *     tags:
   *       - Wallets
   *     security:
   *       - bearerAuth: []
   *     summary: Realiza depósito na carteira do usuário
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               amount:
   *                 type: number
   *                 minimum: 1
   *                 example: 100.00
   *               currency:
   *                 type: string
   *                 enum: [BRL, USD, EUR]
   *                 example: BRL
   *               description:
   *                 type: string
   *                 example: Depósito via cartão de crédito
   *             required:
   *               - amount
   *               - currency
   *     responses:
   *       '201':
   *         description: Depósito realizado com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/WalletResponse'
   *       '400':
   *         description: Dados inválidos
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       '401':
   *         description: Não autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/UnauthorizedError'
   */
  async deposit(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    if (!appConfig.payments.pix.features.depositsEnabled) {
      return this.serviceUnavailable(res, 'Depósitos via Pix estão temporariamente indisponíveis');
    }

    const payload = this.validateSchema(DepositDTO, req.body);
    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    const {
      wallet: updatedWallet,
      pixCharge,
      pixConfirmation,
    } = await this.depositUseCase.execute(
      userId,
      payload.amount,
      payload.currency,
      payload.description,
    );
    await flushWalletCache(userId).catch((error) =>
      console.warn('Failed to flush wallet cache', error),
    );

    return this.created(res, {
      message: 'Depósito realizado com sucesso',
      pix: {
        chargeId: pixCharge.chargeId,
        reference: pixCharge.reference,
        status: pixConfirmation.status,
        provider: pixConfirmation.provider,
        qrCode: pixCharge.qrCode,
        expiresAt: pixCharge.expiresAt,
        confirmedAt: pixConfirmation.confirmedAt,
      },
      wallet: {
        userId: updatedWallet.userId,
        balance: updatedWallet.balance,
        lockedBalance: updatedWallet.lockedBalance,
        currency: updatedWallet.currency,
      },
    });
  }

  /**
   * @openapi
   * /api/wallets/withdraw:
   *   post:
   *     tags:
   *       - Wallets
   *     security:
   *       - bearerAuth: []
   *     summary: Realiza saque da carteira do usuário
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               amount:
   *                 type: number
   *                 minimum: 100
   *                 example: 150.00
   *               currency:
   *                 type: string
   *                 enum: [BRL, USD, EUR]
   *                 example: BRL
   *               description:
   *                 type: string
   *                 example: Saque para conta bancária
   *               pixKey:
   *                 type: string
   *                 example: user@pix
   *                 description: Opcional quando o usuário possui chave padrão cadastrada
   *             required:
   *               - amount
   *               - currency
   *     responses:
   *       '201':
   *         description: Saque realizado com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/WalletResponse'
   *       '400':
   *         description: Dados inválidos ou saldo insuficiente
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       '401':
   *         description: Não autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/UnauthorizedError'
   */
  async withdraw(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    if (!appConfig.payments.pix.features.withdrawalsEnabled) {
      return this.serviceUnavailable(res, 'Saques via Pix estão temporariamente indisponíveis');
    }

    const payload = this.validateSchema(WithdrawDTO, req.body);
    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    let effectivePixKey = payload.pixKey?.trim();
    if (!effectivePixKey) {
      const user = await this.userService.findById(userId);
      if (!user?.pixKey) {
        return this.badRequest(
          res,
          'Informe uma chave Pix válida ou cadastre uma chave padrão antes de solicitar saque.',
        );
      }
      effectivePixKey = user.pixKey;
    }

    const { wallet: updatedWallet, pixPayout } = await this.withdrawUseCase.execute(
      userId,
      payload.amount,
      payload.currency,
      effectivePixKey,
      payload.description,
    );
    await flushWalletCache(userId).catch((error) =>
      console.warn('Failed to flush wallet cache', error),
    );

    return this.created(res, {
      message: 'Saque realizado com sucesso',
      pix: {
        payoutId: pixPayout.payoutId,
        reference: pixPayout.reference,
        status: pixPayout.status,
        provider: pixPayout.provider,
        processedAt: pixPayout.processedAt,
      },
      wallet: {
        userId: updatedWallet.userId,
        balance: updatedWallet.balance,
        lockedBalance: updatedWallet.lockedBalance,
        currency: updatedWallet.currency,
      },
    });
  }

  /**
   * @openapi
   * /api/wallets/history:
   *   get:
   *     tags:
   *       - Wallets
   *     security:
   *       - bearerAuth: []
   *     summary: Retorna histórico de transações da carteira
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   *         description: Número de transações a retornar
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Deslocamento para paginação
   *     responses:
   *       '200':
   *         description: Histórico retornado com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/TransactionHistory'
   *       '401':
   *         description: Não autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/UnauthorizedError'
   */
  async getHistory(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    const limit = Number(req.query.limit || 10);
    const offset = Number(req.query.offset || 0);

    const result = await this.getHistoryUseCase.execute(userId, limit, offset);

    return this.ok(res, {
      transactions: result.transactions,
      pagination: { limit, offset, total: result.total },
    });
  }
}
