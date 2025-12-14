import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { AuthenticatedRequest, getRequestUserId } from '../middleware/AuthMiddleware';
import {
  UpdateProfileDTO,
  ChangeEmailDTO,
  UpdateProfileDTOType,
  ChangeEmailDTOType,
  UpdatePixKeyDTO,
  UpdatePixKeyDTOType,
} from '../dtos/UserDTOs';
import { GetUserProfile } from '@core/user/application/use-cases/GetUserProfile';
import { UpdateProfile } from '@core/user/application/use-cases/UpdateProfile';
import { ChangeEmail } from '@core/user/application/use-cases/ChangeEmail';
import { UpdatePixKey } from '@core/user/application/use-cases/UpdatePixKey';
import { flushUserProfileCache } from '@/infrastructure/cache/cacheHooks';

/**
 * Controller de usuários
 * Gerencia operações de perfil e dados do usuário
 */
export class UserController extends BaseController {
  constructor(
    private getUserProfileUseCase: GetUserProfile,
    private updateProfileUseCase: UpdateProfile,
    private changeEmailUseCase: ChangeEmail,
    private updatePixKeyUseCase: UpdatePixKey,
    private addUserDocumentUseCase?: any,
    private getPreferencesUseCase?: any,
    private updatePreferencesUseCase?: any,
  ) {
    super();
  }

  async getPreferences(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);
    if (!userId) return this.unauthorized(res, 'Autenticação requerida');
    if (!this.getPreferencesUseCase) return this.internalError(res, 'Use-case não disponível');

    const prefs = await this.getPreferencesUseCase.execute(userId);
    return this.ok(res, { preferences: prefs });
  }

  async updatePreferences(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);
    if (!userId) return this.unauthorized(res, 'Autenticação requerida');
    if (!this.updatePreferencesUseCase) return this.internalError(res, 'Use-case não disponível');

    const payload = req.body as Record<string, unknown>;
    const updated = await this.updatePreferencesUseCase.execute(userId, payload);
    await flushUserProfileCache(userId).catch(() => undefined);
    return this.ok(res, { preferences: updated });
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
    const userId = getRequestUserId(req);

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    const user = await this.getUserProfileUseCase.execute(userId);
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
      pixKey: user.pixKey ?? null,
    });
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
    const userId = getRequestUserId(req);

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    const payload = this.validateSchema(UpdateProfileDTO, req.body);
    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    // Construir username a partir de firstName/lastName quando fornecido
    const username = payload.firstName
      ? `${payload.firstName}${payload.lastName ? '.' + payload.lastName : ''}`
      : undefined;

    // Delegar atualização para use-case (que chama o UserService)
    await this.updateProfileUseCase.execute(userId, { username: username || '' });
    await flushUserProfileCache(userId).catch((error) =>
      console.warn('Failed to flush user cache', error),
    );

    const user = await this.getUserProfileUseCase.execute(userId);
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
        pixKey: user.pixKey ?? null,
      },
    });
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
    const userId = getRequestUserId(req);

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    const payload = this.validateSchema(ChangeEmailDTO, req.body);
    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    // Delegar mudança de email para use-case
    await this.changeEmailUseCase.execute(userId, payload.email);
    await flushUserProfileCache(userId).catch((error) =>
      console.warn('Failed to flush user cache', error),
    );

    const updatedUser = await this.getUserProfileUseCase.execute(userId);
    return this.ok(res, {
      message: 'Email alterado com sucesso',
      user: updatedUser
        ? {
            id: updatedUser.id,
            email: updatedUser.email.value,
            username: updatedUser.username,
            firstName: updatedUser.username.split('.')[0],
            lastName: updatedUser.username.split('.')[1] || '',
            status: updatedUser.status,
            createdAt: updatedUser.createdAt,
            pixKey: updatedUser.pixKey ?? null,
          }
        : null,
    });
  }

  async getPixKey(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    const user = await this.getUserProfileUseCase.execute(userId);
    if (!user) {
      return this.notFound(res, 'Usuário não encontrado');
    }

    return this.ok(res, {
      pixKey: user.pixKey ?? null,
    });
  }


  async updatePixKey(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    const payload = this.validateSchema(UpdatePixKeyDTO, req.body) as UpdatePixKeyDTOType;
    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    const normalizedPixKey = payload.pixKey === '' ? null : payload.pixKey;
    await this.updatePixKeyUseCase.execute(userId, normalizedPixKey ?? null);
    await flushUserProfileCache(userId).catch((error) =>
      console.warn('Failed to flush user cache', error),
    );

    const user = await this.getUserProfileUseCase.execute(userId);
    if (!user) {
      return this.notFound(res, 'Usuário não encontrado');
    }

    return this.ok(res, {
      message: 'Chave Pix atualizada com sucesso',
      pixKey: user.pixKey ?? null,
    });
  }

  async uploadDocument(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = getRequestUserId(req);

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    const stored = (req as any).storedFile;
    if (!stored) {
      return this.badRequest(res, 'Arquivo não enviado');
    }

    if (!this.addUserDocumentUseCase) {
      return this.internalError(res, 'Upload handler não disponível');
    }

    const doc = {
      id: stored.id,
      type: null,
      filename: stored.filename,
      originalName: stored.originalName,
      mimeType: stored.mimeType,
      size: stored.size,
      url: stored.url,
      uploadedAt: new Date().toISOString(),
      verified: false,
    };

    await this.addUserDocumentUseCase.execute(userId, doc);
    await flushUserProfileCache(userId).catch((error) =>
      console.warn('Failed to flush user cache', error),
    );

    return this.ok(res, { message: 'Documento enviado com sucesso', document: doc });
  }
}
