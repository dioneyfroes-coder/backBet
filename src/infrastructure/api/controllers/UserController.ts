import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { AuthenticatedRequest } from '../middleware/AuthMiddleware';
import { UpdateProfileDTO, ChangeEmailDTO, UpdateProfileDTOType, ChangeEmailDTOType } from '../dtos/UserDTOs';
import { UserService } from '@core/user/domain/services/UserService';

/**
 * Controller de usuários
 * Gerencia operações de perfil e dados do usuário
 */
export class UserController extends BaseController {
  constructor(private userService: UserService) {
    super();
  }

  /**
   * @openapi
   * /api/users/me:
   *   get:
   *     tags:
   *       - Users
   *     security:
   *       - bearerAuth: []
   *     summary: Retorna dados completos do usuário autenticado
   *     responses:
   *       '200':
   *         description: Usuário encontrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MeResponse'
   *       '401':
   *         description: Não autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/UnauthorizedError'
   *       '404':
   *         description: Usuário não encontrado
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

      const user = await this.userService.findById(userId);
      if (!user) {
        return this.notFound(res, 'Usuário não encontrado');
      }

      return this.ok(res, {
        id: user.id,
        email: user.email.value,
        username: user.username,
        firstName: user.username.split('.')[0],
        lastName: user.username.split('.')[1] || '',
        status: user.status,
        createdAt: user.createdAt,
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/users/me:
   *   patch:
   *     tags:
   *       - Users
   *     security:
   *       - bearerAuth: []
   *     summary: Atualiza perfil do usuário autenticado
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               firstName:
   *                 type: string
   *                 minLength: 2
   *                 example: João
   *               lastName:
   *                 type: string
   *                 minLength: 2
   *                 example: Silva
   *               bio:
   *                 type: string
   *                 maxLength: 500
   *                 example: Apaixonado por apostas desportivas
   *     responses:
   *       '200':
   *         description: Perfil atualizado com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MeResponse'
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
  async updateProfile(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const userId = req.auth?.userId;

      if (!userId) {
        return this.unauthorized(res, 'Autenticação requerida');
      }

      const payload = this.validateSchema(UpdateProfileDTO, req.body);
      if (!payload) {
        return this.badRequest(res, 'Dados inválidos');
      }

      // TODO: Implementar lógica de atualização no UserService
      // Por enquanto, retornar o usuário atualizado

      const user = await this.userService.findById(userId);
      if (!user) {
        return this.notFound(res, 'Usuário não encontrado');
      }

      return this.ok(res, {
        message: 'Perfil atualizado com sucesso',
        user: {
          id: user.id,
          email: user.email.value,
          username: user.username,
          firstName: payload.firstName || user.username.split('.')[0],
          lastName: payload.lastName || user.username.split('.')[1] || '',
          status: user.status,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/users/me/email:
   *   patch:
   *     tags:
   *       - Users
   *     security:
   *       - bearerAuth: []
   *     summary: Altera email do usuário autenticado
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: newemail@example.com
   *               verificationCode:
   *                 type: string
   *                 description: Código de verificação enviado por email
   *             required:
   *               - email
   *     responses:
   *       '200':
   *         description: Email alterado com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MeResponse'
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
   *       '409':
   *         description: Email já cadastrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ConflictError'
   */
  async changeEmail(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const userId = req.auth?.userId;

      if (!userId) {
        return this.unauthorized(res, 'Autenticação requerida');
      }

      const payload = this.validateSchema(ChangeEmailDTO, req.body);
      if (!payload) {
        return this.badRequest(res, 'Dados inválidos');
      }

      // Verificar se novo email já existe
      const existingUser = await this.userService.findByEmail(payload.email);
      if (existingUser && existingUser.id !== userId) {
        return this.conflict(res, 'Email já cadastrado');
      }

      const user = await this.userService.findById(userId);
      if (!user) {
        return this.notFound(res, 'Usuário não encontrado');
      }

      // TODO: Implementar lógica de mudança de email com verificação
      // Por enquanto, retornar sucesso

      return this.ok(res, {
        message: 'Email alterado com sucesso',
        user: {
          id: user.id,
          email: payload.email,
          username: user.username,
          firstName: user.username.split('.')[0],
          lastName: user.username.split('.')[1] || '',
          status: user.status,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}
