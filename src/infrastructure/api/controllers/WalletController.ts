import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { AuthenticatedRequest } from '../middleware/AuthMiddleware';
import { DepositDTO, WithdrawDTO } from '../dtos/WalletDTOs';
import { GetWallet } from '@core/finance/application/use-cases/GetWallet';
import { Deposit } from '@core/finance/application/use-cases/Deposit';
import { Withdraw } from '@core/finance/application/use-cases/Withdraw';

/**
 * Controller de carteiras
 * Gerencia operações de depósito, saque e histórico
 */
export class WalletController extends BaseController {
  constructor(
    private getWalletUseCase: GetWallet,
    private depositUseCase: Deposit,
    private withdrawUseCase: Withdraw
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
    try {
      const userId = req.auth?.userId;

      if (!userId) {
        return this.unauthorized(res, 'Autenticação requerida');
      }

      const wallet = await this.getWalletUseCase.execute(userId);
      if (!wallet) {
        return this.notFound(res, 'Carteira não encontrada');
      }

      return this.ok(res, {
        userId: wallet.userId,
        balance: wallet.balance,
        lockedBalance: wallet.lockedBalance,
        currency: wallet.currency,
      });
    } catch (error) {
      return this.handleError(error, res);
    }
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
   *                 minimum: 0.01
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
    try {
      const userId = req.auth?.userId;

      if (!userId) {
        return this.unauthorized(res, 'Autenticação requerida');
      }

      const payload = this.validateSchema(DepositDTO, req.body);
      if (!payload) {
        return this.badRequest(res, 'Dados inválidos');
      }

      const wallet = await this.getWalletUseCase.execute(userId);
      if (!wallet) {
        return this.notFound(res, 'Carteira não encontrada');
      }

      // Realiza o depósito via serviço (pode lançar se houver erro)
      const updatedWallet = await this.depositUseCase.execute(userId, payload.amount);

      return this.created(res, {
        message: 'Depósito realizado com sucesso',
        wallet: {
          userId: updatedWallet.userId,
          balance: updatedWallet.balance,
          lockedBalance: updatedWallet.lockedBalance,
          currency: updatedWallet.currency,
        },
      });
    } catch (error) {
      return this.handleError(error, res);
    }
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
   *                 minimum: 0.01
   *                 example: 50.00
   *               currency:
   *                 type: string
   *                 enum: [BRL, USD, EUR]
   *                 example: BRL
   *               description:
   *                 type: string
   *                 example: Saque para conta bancária
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
    try {
      const userId = req.auth?.userId;

      if (!userId) {
        return this.unauthorized(res, 'Autenticação requerida');
      }

      const payload = this.validateSchema(WithdrawDTO, req.body);
      if (!payload) {
        return this.badRequest(res, 'Dados inválidos');
      }

      const wallet = await this.getWalletUseCase.execute(userId);
      if (!wallet) {
        return this.notFound(res, 'Carteira não encontrada');
      }

      // Verificar saldo
      if (wallet.balance < payload.amount) {
        return this.badRequest(res, 'Saldo insuficiente');
      }

      // Realiza o saque via serviço (pode lançar se houver erro)
  const updatedWallet = await this.withdrawUseCase.execute(userId, payload.amount);

      return this.created(res, {
        message: 'Saque realizado com sucesso',
        wallet: {
          userId: updatedWallet.userId,
          balance: updatedWallet.balance,
          lockedBalance: updatedWallet.lockedBalance,
          currency: updatedWallet.currency,
        },
      });
    } catch (error) {
      return this.handleError(error, res);
    }
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
    try {
      const userId = req.auth?.userId;

      if (!userId) {
        return this.unauthorized(res, 'Autenticação requerida');
      }

      // TODO: Implementar busca de histórico de transações

      return this.ok(res, {
        transactions: [],
        pagination: { limit: 10, offset: 0, total: 0 },
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}
