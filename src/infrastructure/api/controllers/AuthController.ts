import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { AuthenticatedRequest } from '../middleware/AuthMiddleware';
import { RegisterDTO, LoginDTO, RefreshTokenDTO, LogoutDTO, RegisterDTOType } from '../dtos/AuthDTOs';
import { RegisterUser } from '@core/user/application/use-cases/RegisterUser';
import { UserService } from '@core/user/domain/services/UserService';

/**
 * Controller de autenticação
 * Integra com Clerk para gerenciar sessions
 */
export class AuthController extends BaseController {
  constructor(
    private registerUserUseCase: RegisterUser,
    private userService: UserService
  ) {
    super();
  }

  /**
   * @openapi
   * /api/auth/register:
   *   post:
   *     tags:
   *       - Auth
   *     summary: Registra novo usuário e cria carteira inicial
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RegisterRequest'
   *     responses:
   *       '201':
   *         description: Usuário registrado com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/RegisterResponse'
   *       '400':
   *         description: Dados inválidos
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       '409':
   *         description: Email já cadastrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ConflictError'
   */
  async register(req: Request, res: Response): Promise<Response> {
    const payload = this.validateSchema(RegisterDTO, req.body);

    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    // Delegar registro para use-case
    const result = await this.registerUserUseCase.execute({
      email: payload.email,
      username: payload.username,
      currency: 'BRL',
    });

    return this.created(res, {
      message: 'Usuário registrado com sucesso',
      user: result.user,
      wallet: result.wallet,
    });
  }

  /**
   * @openapi
   * /api/auth/login:
   *   post:
   *     tags:
   *       - Auth
   *     summary: Autentica usuário (placeholder - usar Clerk OAuth em produção)
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
   *               password:
   *                 type: string
   *                 example: 'Senha'
   *     responses:
   *       '200':
   *         description: Token retornado
   *         content:
   *           application/json:
   *             $ref: '#/components/schemas/AuthResponse'
   *       '401':
   *         description: Credenciais inválidas
   *         content:
   *           application/json:
   *             $ref: '#/components/schemas/ErrorResponse'
   */
  async login(req: Request, res: Response): Promise<Response> {
    const payload = this.validateSchema(LoginDTO, req.body);

    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    // Buscar usuário
    const user = await this.userService.findByEmail(payload.email);
    if (!user) {
      return this.unauthorized(res, 'Email ou senha inválidos');
    }

    // Validar senha (integrar com Clerk depois)
    // Por enquanto, retornar erro informando que precisa usar OAuth
    return this.internalError(
      res,
      'Login deve ser feito via Clerk OAuth. Use o SDK de front-end.'
    );
  }

  /**
   * @openapi
   * /api/auth/refresh:
   *   post:
   *     tags:
   *       - Auth
   *     summary: Renova access token usando refresh token (placeholder)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               refreshToken:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Token renovado
   *         content:
   *           application/json:
   *             $ref: '#/components/schemas/AuthResponse'
   *       '400':
   *         content:
   *           application/json:
   *             $ref: '#/components/schemas/ErrorResponse'
   */
  async refreshToken(req: Request, res: Response): Promise<Response> {
    const payload = this.validateSchema(RefreshTokenDTO, req.body);

    // Implementar refresh token com Clerk
    return this.ok(res, {
      message: 'Refresh via Clerk OAuth necessário',
    });
  }

  /**
   * @openapi
   * /api/auth/me:
   *   get:
   *     tags:
   *       - Auth
   *     security:
   *       - bearerAuth: []
   *     summary: Retorna dados do usuário autenticado
   *     responses:
   *       '200':
   *         description: Dados do usuário
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
  async me(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = req.auth?.userId;

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    // Buscar usuário
    const user = await this.userService.findById(userId);
    if (!user) {
      return this.notFound(res, 'Usuário não encontrado');
    }

    return this.ok(res, {
      id: user.id,
      email: user.email.value,
      username: user.username,
      firstName: user.username.split('.')[0], // TODO: Adicionar firstName/lastName ao User
      lastName: user.username.split('.')[1] || '',
      status: user.status,
      createdAt: user.createdAt,
    });
  }

  /**
   * @openapi
   * /api/auth/logout:
   *   post:
   *     tags:
   *       - Auth
   *     security:
   *       - bearerAuth: []
   *     summary: Faz logout e invalida session (gerenciado pelo Clerk)
   *     responses:
   *       '200':
   *         description: Logout realizado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/LogoutResponse'
   *       '401':
   *         description: Não autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/UnauthorizedError'
   */
  async logout(req: AuthenticatedRequest, res: Response): Promise<Response> {
    // Logout é gerenciado pelo Clerk no cliente
    return this.ok(res, {
      message: 'Logout realizado com sucesso',
    });
  }
}
